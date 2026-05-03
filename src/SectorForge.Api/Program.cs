using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;
using SectorForge.Api.Hubs;
using SectorForge.Api.Services;
using SectorForge.Collector;
using SectorForge.Collector.Adapters;
using SectorForge.Collector.Adapters.F125;
using SectorForge.Collector.Adapters.Udp;
using SectorForge.Core.Telemetry;
using SectorForge.Core.Telemetry.Configuration;
using SectorForge.Core.Telemetry.Udp;
using SectorForge.Infrastructure.Storage;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<CollectorOptions>(builder.Configuration.GetSection(CollectorOptions.SectionName));
builder.Services.Configure<StorageOptions>(builder.Configuration.GetSection(StorageOptions.SectionName));
builder.Services.Configure<TelemetryAdaptersOptions>(options =>
{
    var section = builder.Configuration.GetSection(TelemetryAdaptersOptions.SectionName);
    foreach (var child in section.GetChildren())
    {
        var entry = new TelemetryAdapterOptions();
        child.Bind(entry);
        options.Items[child.Key] = entry;
    }
});

builder.Services.ConfigureHttpJsonOptions(options => ConfigureJson(options.SerializerOptions));
builder.Services.AddSignalR().AddJsonProtocol(options => ConfigureJson(options.PayloadSerializerOptions));
builder.Services.AddCors(options =>
{
    options.AddPolicy("SectorForgeWeb", policy =>
    {
        policy.SetIsOriginAllowed(origin =>
            Uri.TryCreate(origin, UriKind.Absolute, out var uri)
            && (uri.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase)
                || uri.Host.Equals("127.0.0.1", StringComparison.OrdinalIgnoreCase)))
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

builder.Services.AddSingleton<ITelemetrySessionStore>(services =>
{
    var storage = services.GetRequiredService<IOptions<StorageOptions>>().Value;
    return new SqliteTelemetrySessionStore(
        builder.Configuration.GetConnectionString("SectorForge") ?? SqliteTelemetrySessionStore.CreateDefaultConnectionString(),
        storage.RetainedSampleBlobLimit);
});
builder.Services.AddSingleton<ILiveTelemetryPublisher, SignalRTelemetryPublisher>();
builder.Services.AddSingleton<IUdpTelemetryListenerFactory, UdpTelemetryListenerFactory>();
builder.Services.AddSingleton<F125PacketReader>();
builder.Services.AddSingleton<F125Normalizer>();
builder.Services.AddSingleton<ITelemetryAdapter>(services =>
{
    var adapters = services.GetRequiredService<IOptions<TelemetryAdaptersOptions>>().Value;
    var fake = adapters.For("fake");
    var rateHz = fake.SampleRateHz is > 0 ? fake.SampleRateHz.Value : TelemetryAdapterOptions.DefaultFakeSampleRateHz;
    return new FakeTelemetryAdapter(TimeSpan.FromSeconds(1d / rateHz));
});
builder.Services.AddSingleton<ITelemetryAdapter, F125UdpTelemetryAdapter>();
builder.Services.AddSingleton<ITelemetryAdapter, AccSharedMemoryTelemetryAdapter>();
builder.Services.AddSingleton<ITelemetryAdapter, Ams2TelemetryAdapter>();
builder.Services.AddSingleton<ITelemetryAdapter, LmuUdpTelemetryAdapter>();
builder.Services.AddSingleton<TelemetryCollectorService>();
builder.Services.AddSingleton<ITelemetryReceiver>(services => services.GetRequiredService<TelemetryCollectorService>());
builder.Services.AddHostedService<CollectorAutoStartService>();

var app = builder.Build();

app.UseCors("SectorForgeWeb");

app.MapGet("/", () => Results.Redirect("/api/health"));

app.MapGet("/api/health", (IHostEnvironment environment) => Results.Ok(new
{
    status = "ok",
    app = "SectorForge.Api",
    environment = environment.EnvironmentName,
    timestamp = DateTimeOffset.UtcNow
}));

app.MapGet("/api/games", (TelemetryCollectorService collector) =>
{
    var status = collector.GetStatus();
    return Results.Ok(collector.Sources.Select(source =>
        status.IsRunning && status.ActiveAdapterId == source.AdapterId
            ? source with { Status = TelemetrySourceStatus.Running }
            : source));
});

app.MapGet("/api/sessions", async (ITelemetrySessionStore store, CancellationToken cancellationToken) =>
    Results.Ok(await store.ListSessionsAsync(cancellationToken)));

app.MapGet("/api/sessions/{id:guid}", async (Guid id, ITelemetrySessionStore store, CancellationToken cancellationToken) =>
{
    var session = await store.GetSessionAsync(id, cancellationToken);
    return session is null ? Results.NotFound() : Results.Ok(session);
});

app.MapDelete("/api/sessions/{id:guid}", async (
    Guid id,
    ITelemetrySessionStore store,
    TelemetryCollectorService collector,
    CancellationToken cancellationToken) =>
{
    var status = collector.GetStatus();
    if (status.IsRunning && status.RunMode == TelemetryRunMode.Replay && status.LatestSample?.SessionId == id)
    {
        return Results.Conflict(new { error = "Stop the active replay before deleting this session." });
    }

    var deleted = await store.DeleteSessionAsync(id, cancellationToken);
    return deleted ? Results.NoContent() : Results.NotFound();
});

app.MapPost("/api/collector/start", async (HttpContext context, TelemetryCollectorService collector) =>
{
    StartCollectorRequest? request = null;
    if (context.Request.ContentLength is > 0)
    {
        request = await context.Request.ReadFromJsonAsync<StartCollectorRequest>(cancellationToken: context.RequestAborted);
    }

    var adapterId = string.IsNullOrWhiteSpace(request?.AdapterId) ? "fake" : request.AdapterId;

    try
    {
        await collector.StartAsync(adapterId, context.RequestAborted);
        return Results.Ok(collector.GetStatus());
    }
    catch (KeyNotFoundException ex)
    {
        return Results.NotFound(new { error = ex.Message });
    }
    catch (InvalidOperationException ex)
    {
        return Results.BadRequest(new { error = ex.Message });
    }
});

app.MapPost("/api/collector/stop", async (TelemetryCollectorService collector, CancellationToken cancellationToken) =>
{
    await collector.StopAsync(cancellationToken);
    return Results.Ok(collector.GetStatus());
});

app.MapPost("/api/replay/start/{sessionId:guid}", async (Guid sessionId, TelemetryCollectorService collector, CancellationToken cancellationToken) =>
{
    try
    {
        await collector.StartReplayAsync(sessionId, cancellationToken);
        return Results.Ok(collector.GetStatus());
    }
    catch (KeyNotFoundException ex)
    {
        return Results.NotFound(new { error = ex.Message });
    }
});

app.MapPost("/api/replay/stop", async (TelemetryCollectorService collector, CancellationToken cancellationToken) =>
{
    await collector.StopAsync(cancellationToken);
    return Results.Ok(collector.GetStatus());
});

app.MapGet("/api/collector/status", (TelemetryCollectorService collector) => Results.Ok(collector.GetStatus()));

app.MapHub<TelemetryHub>("/hubs/telemetry");

app.Run();

static void ConfigureJson(JsonSerializerOptions options)
{
    options.Converters.Add(new JsonStringEnumConverter());
}

public sealed record StartCollectorRequest(string? AdapterId);

public partial class Program;
