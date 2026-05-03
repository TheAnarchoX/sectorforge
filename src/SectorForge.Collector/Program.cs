using SectorForge.Collector.Adapters;
using SectorForge.Collector.Adapters.F125;
using SectorForge.Collector.Adapters.Udp;
using SectorForge.Core.Telemetry;
using SectorForge.Core.Telemetry.Configuration;
using SectorForge.Core.Telemetry.Udp;

namespace SectorForge.Collector;

public static class CollectorProgram
{
    public static void Main(string[] args)
    {
        using var host = CreateHost(args);
        host.Run();
    }

    public static IHost CreateHost(string[] args)
    {
        var builder = Host.CreateApplicationBuilder(args);
        builder.Services.Configure<TelemetryAdaptersOptions>(options => BindTelemetryAdapterOptions(builder.Configuration, options));
        builder.Services.AddSingleton<FakeTelemetryAdapter>(services =>
        {
            var adapters = services.GetRequiredService<Microsoft.Extensions.Options.IOptions<TelemetryAdaptersOptions>>().Value;
            var fake = adapters.For("fake");
            var rateHz = fake.SampleRateHz is > 0 ? fake.SampleRateHz.Value : TelemetryAdapterOptions.DefaultFakeSampleRateHz;
            return new FakeTelemetryAdapter(TimeSpan.FromSeconds(1d / rateHz));
        });
        builder.Services.AddSingleton<ITelemetryAdapter>(services => services.GetRequiredService<FakeTelemetryAdapter>());
        builder.Services.AddSingleton<IUdpTelemetryListenerFactory, UdpTelemetryListenerFactory>();
        builder.Services.AddSingleton<F125PacketReader>();
        builder.Services.AddSingleton<F125Normalizer>();
        builder.Services.AddSingleton<ITelemetryAdapter, F125UdpTelemetryAdapter>();
        builder.Services.AddHostedService<Worker>();

        return builder.Build();
    }

    private static void BindTelemetryAdapterOptions(IConfiguration configuration, TelemetryAdaptersOptions options)
    {
        var section = configuration.GetSection(TelemetryAdaptersOptions.SectionName);
        foreach (var child in section.GetChildren())
        {
            var entry = new TelemetryAdapterOptions();
            child.Bind(entry);
            options.Items[child.Key] = entry;
        }
    }
}
