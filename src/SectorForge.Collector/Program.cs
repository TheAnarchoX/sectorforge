using SectorForge.Collector;
using SectorForge.Collector.Adapters;

var builder = Host.CreateApplicationBuilder(args);
builder.Services.AddSingleton<FakeTelemetryAdapter>();
builder.Services.AddHostedService<Worker>();

var host = builder.Build();
host.Run();
