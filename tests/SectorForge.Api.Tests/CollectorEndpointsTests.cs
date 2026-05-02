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
            Assert.Equal(TelemetryRunMode.Live, startedStatus.RunMode);
            Assert.Equal("fake", startedStatus.ActiveAdapterId);

            var statusResponse = await client.GetAsync("/api/collector/status");
            statusResponse.EnsureSuccessStatusCode();

            var runningStatus = await statusResponse.Content.ReadFromJsonAsync<TelemetryReceiverStatus>(JsonOptions);
            Assert.NotNull(runningStatus);
            Assert.True(runningStatus.IsRunning);
            Assert.Equal(TelemetryRunMode.Live, runningStatus.RunMode);
            Assert.Equal("fake", runningStatus.ActiveAdapterId);

            var stopResponse = await client.PostAsync("/api/collector/stop", content: null);
            stopResponse.EnsureSuccessStatusCode();

            var stoppedStatus = await stopResponse.Content.ReadFromJsonAsync<TelemetryReceiverStatus>(JsonOptions);
            Assert.NotNull(stoppedStatus);
            Assert.False(stoppedStatus.IsRunning);
            Assert.Equal(TelemetryRunMode.Idle, stoppedStatus.RunMode);

            var finalStatusResponse = await client.GetAsync("/api/collector/status");
            finalStatusResponse.EnsureSuccessStatusCode();

            var finalStatus = await finalStatusResponse.Content.ReadFromJsonAsync<TelemetryReceiverStatus>(JsonOptions);
            Assert.NotNull(finalStatus);
            Assert.False(finalStatus.IsRunning);
            Assert.Equal(TelemetryRunMode.Idle, finalStatus.RunMode);
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

    [Fact]
    public async Task ReplayStartReturnsNotFoundForMissingSession()
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

            var response = await client.PostAsync($"/api/replay/start/{Guid.NewGuid()}", content: null);

            Assert.Equal(System.Net.HttpStatusCode.NotFound, response.StatusCode);
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

    [Fact]
    public async Task ReplayStartReturnsRunningStatusForStoredSession()
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

            var session = await WaitForSavedSessionAsync(client, TimeSpan.FromSeconds(2));

            var stopResponse = await client.PostAsync("/api/collector/stop", content: null);
            stopResponse.EnsureSuccessStatusCode();

            var replayResponse = await client.PostAsync($"/api/replay/start/{session.Id}", content: null);
            replayResponse.EnsureSuccessStatusCode();

            var replayStatus = await replayResponse.Content.ReadFromJsonAsync<TelemetryReceiverStatus>(JsonOptions);
            Assert.NotNull(replayStatus);
            Assert.True(replayStatus.IsRunning);
            Assert.Equal(TelemetryRunMode.Replay, replayStatus.RunMode);
            Assert.Equal("replay", replayStatus.ActiveAdapterId);
            Assert.NotNull(replayStatus.Source);
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

    private static async Task<TelemetrySessionSummary> WaitForSavedSessionAsync(HttpClient client, TimeSpan timeout)
    {
        var startedAt = DateTimeOffset.UtcNow;

        while (DateTimeOffset.UtcNow - startedAt <= timeout)
        {
            var response = await client.GetAsync("/api/sessions");
            response.EnsureSuccessStatusCode();

            var sessions = await response.Content.ReadFromJsonAsync<IReadOnlyList<TelemetrySessionSummary>>(JsonOptions);
            var session = sessions?.FirstOrDefault(candidate => candidate.SampleCount > 0);
            if (session is not null)
            {
                return session;
            }

            await Task.Delay(20);
        }

        throw new TimeoutException("Timed out waiting for a stored telemetry session.");
    }

    private static JsonSerializerOptions CreateJsonOptions()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        options.Converters.Add(new JsonStringEnumConverter());
        return options;
    }
}
