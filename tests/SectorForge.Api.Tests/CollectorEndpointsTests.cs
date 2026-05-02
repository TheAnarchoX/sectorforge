using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Configuration;
using SectorForge.Core.Telemetry;

namespace SectorForge.Api.Tests;

public sealed class CollectorEndpointsTests
{
    private static readonly JsonSerializerOptions JsonOptions = CreateJsonOptions();

    [Fact]
    public async Task CollectorControlEndpointsStartAndStopFakeCollector()
    {
        var testDataDirectory = Path.Combine(Path.GetTempPath(), "SectorForge.Tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(testDataDirectory);
        WebApplicationFactory<Program>? factory = null;
        HttpClient? client = null;

        try
        {
            var connectionString = new SqliteConnectionStringBuilder
            {
                DataSource = Path.Combine(testDataDirectory, "sectorforge.db"),
                Mode = SqliteOpenMode.ReadWriteCreate
            }.ToString();

            factory = CreateFactory(connectionString);
            client = factory.CreateClient();

            var startResponse = await client.PostAsJsonAsync("/api/collector/start", new { adapterId = "fake" });
            startResponse.EnsureSuccessStatusCode();

            var startedStatus = await startResponse.Content.ReadFromJsonAsync<TelemetryReceiverStatus>(JsonOptions);
            Assert.NotNull(startedStatus);
            Assert.True(startedStatus.IsRunning);
            Assert.Equal("fake", startedStatus.ActiveAdapterId);

            var statusResponse = await client.GetAsync("/api/collector/status");
            statusResponse.EnsureSuccessStatusCode();

            var runningStatus = await statusResponse.Content.ReadFromJsonAsync<TelemetryReceiverStatus>(JsonOptions);
            Assert.NotNull(runningStatus);
            Assert.True(runningStatus.IsRunning);
            Assert.Equal("fake", runningStatus.ActiveAdapterId);

            var stopResponse = await client.PostAsync("/api/collector/stop", content: null);
            stopResponse.EnsureSuccessStatusCode();

            var stoppedStatus = await stopResponse.Content.ReadFromJsonAsync<TelemetryReceiverStatus>(JsonOptions);
            Assert.NotNull(stoppedStatus);
            Assert.False(stoppedStatus.IsRunning);

            var finalStatusResponse = await client.GetAsync("/api/collector/status");
            finalStatusResponse.EnsureSuccessStatusCode();

            var finalStatus = await finalStatusResponse.Content.ReadFromJsonAsync<TelemetryReceiverStatus>(JsonOptions);
            Assert.NotNull(finalStatus);
            Assert.False(finalStatus.IsRunning);
        }
        finally
        {
            client?.Dispose();
            factory?.Dispose();

            if (Directory.Exists(testDataDirectory))
            {
                try
                {
                    Directory.Delete(testDataDirectory, recursive: true);
                }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
                {
                }
            }
        }
    }

    private static WebApplicationFactory<Program> CreateFactory(string connectionString)
    {
        return new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.ConfigureAppConfiguration((_, configBuilder) =>
            {
                configBuilder.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["Collector:AutoStart"] = "false",
                    ["ConnectionStrings:SectorForge"] = connectionString
                });
            });
        });
    }

    private static JsonSerializerOptions CreateJsonOptions()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        options.Converters.Add(new JsonStringEnumConverter());
        return options;
    }
}
