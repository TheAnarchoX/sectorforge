using SectorForge.Collector.Adapters;

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
        builder.Services.AddSingleton<FakeTelemetryAdapter>();
        builder.Services.AddHostedService<Worker>();

        return builder.Build();
    }
}
