using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;

namespace SectorForge.Api.Tests;

internal static class ApiTestFactory
{
    public static WebApplicationFactory<Program> Create(IReadOnlyDictionary<string, string?>? overrides = null)
    {
        return new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Testing");
            builder.ConfigureAppConfiguration((_, configBuilder) =>
            {
                var configuration = new Dictionary<string, string?>
                {
                    ["Collector:AutoStart"] = "false",
                    ["Adapters:f1-25-udp:Enabled"] = "false"
                };

                if (overrides is not null)
                {
                    foreach (var item in overrides)
                    {
                        configuration[item.Key] = item.Value;
                    }
                }

                configBuilder.AddInMemoryCollection(configuration);
            });
        });
    }
}
