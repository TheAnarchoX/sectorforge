using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using SectorForge.Collector.Adapters;
using SectorForge.Core.Telemetry;
using SectorForge.Infrastructure.Storage;

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
    public async Task CollectorStartReturnsNotFoundForUnknownAdapter()
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

            var response = await client.PostAsJsonAsync("/api/collector/start", new { adapterId = "missing" });

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
    public async Task CollectorStartReturnsBadRequestForUnavailableAdapter()
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

            var response = await client.PostAsJsonAsync("/api/collector/start", new { adapterId = "f1-25-udp" });

            Assert.Equal(System.Net.HttpStatusCode.BadRequest, response.StatusCode);
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
    public async Task GamesEndpointListsRegisteredSourcesAndMarksActiveAdapterRunning()
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

            var response = await client.GetAsync("/api/games");
            response.EnsureSuccessStatusCode();

            var sources = await response.Content.ReadFromJsonAsync<IReadOnlyList<TelemetrySource>>(JsonOptions);
            Assert.NotNull(sources);
            Assert.Contains(sources, source => source.AdapterId == "fake" && source.Status == TelemetrySourceStatus.Running);
            Assert.Contains(sources, source => source.AdapterId == "f1-25-udp" && source.Status == TelemetrySourceStatus.Offline);
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

    [Fact]
    public async Task DeleteSessionRemovesSessionFromList()
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

            var deleteResponse = await client.DeleteAsync($"/api/sessions/{session.Id}");
            Assert.Equal(System.Net.HttpStatusCode.NoContent, deleteResponse.StatusCode);

            var detailResponse = await client.GetAsync($"/api/sessions/{session.Id}");
            Assert.Equal(System.Net.HttpStatusCode.NotFound, detailResponse.StatusCode);

            var listResponse = await client.GetAsync("/api/sessions");
            listResponse.EnsureSuccessStatusCode();
            var sessions = await listResponse.Content.ReadFromJsonAsync<IReadOnlyList<TelemetrySessionSummary>>(JsonOptions);
            Assert.NotNull(sessions);
            Assert.DoesNotContain(sessions, candidate => candidate.Id == session.Id);

            var missing = await client.DeleteAsync($"/api/sessions/{Guid.NewGuid()}");
            Assert.Equal(System.Net.HttpStatusCode.NotFound, missing.StatusCode);
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
    public async Task LapChannelsReturnsNotFoundForUnknownSession()
    {
        await WithApiClientAsync(async (client, _) =>
        {
            var response = await client.GetAsync($"/api/sessions/{Guid.NewGuid()}/laps/1/channels");

            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        });
    }

    [Fact]
    public async Task LapChannelsReturnsNotFoundForUnknownLap()
    {
        await WithApiClientAsync(async (client, connectionString) =>
        {
            var sessionId = Guid.NewGuid();
            var sample = new FakeTelemetryAdapter().CreateSample(TimeSpan.FromSeconds(5), 1, sessionId);
            await SaveSamplesAsync(connectionString, [sample]);

            var response = await client.GetAsync($"/api/sessions/{sessionId}/laps/99/channels");

            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        });
    }

    [Fact]
    public async Task LapChannelsReturnsGoneForPrunedLapSamples()
    {
        await WithApiClientAsync(async (client, connectionString) =>
        {
            var sessionId = Guid.NewGuid();
            var adapter = new FakeTelemetryAdapter();
            await SaveSamplesAsync(
                connectionString,
                [
                    adapter.CreateSample(TimeSpan.FromSeconds(5), 1, sessionId),
                    adapter.CreateSample(TimeSpan.FromSeconds(95), 2, sessionId)
                ],
                retainedSampleBlobLimit: 1);

            var response = await client.GetAsync($"/api/sessions/{sessionId}/laps/1/channels");
            var body = await response.Content.ReadAsStringAsync();

            Assert.Equal(HttpStatusCode.Gone, response.StatusCode);
            Assert.Contains("no longer retained", body, StringComparison.OrdinalIgnoreCase);
        }, retainedSampleBlobLimit: 1);
    }

    [Fact]
    public async Task LapChannelsReturnsAlignedChannelArraysAndManifest()
    {
        await WithApiClientAsync(async (client, connectionString) =>
        {
            var sessionId = Guid.NewGuid();
            await SaveSamplesAsync(connectionString, CreateLapChannelSamples(sessionId));

            var response = await client.GetAsync($"/api/sessions/{sessionId}/laps/2/channels");
            response.EnsureSuccessStatusCode();

            var channels = await response.Content.ReadFromJsonAsync<LapChannelsResponse>(JsonOptions);

            Assert.NotNull(channels);
            Assert.Equal(sessionId, channels.SessionId);
            Assert.Equal(2, channels.LapNumber);
            Assert.Equal(2, channels.SampleCount);
            Assert.Equal(TimeSpan.FromSeconds(2), channels.LapTime);
            Assert.Equal(TimeSpan.FromSeconds(31), channels.Sector1Time);
            Assert.Equal(TimeSpan.FromSeconds(32), channels.Sector2Time);
            Assert.Equal(TimeSpan.FromSeconds(33), channels.Sector3Time);
            Assert.Equal(
                ["time", "lapDistance", "speedKph", "rpm", "throttle", "brake", "steering", "lateralG", "longitudinalG", "drsActive", "ersStoreJoules"],
                channels.Manifest.Select(channel => channel.Key).ToArray());
            Assert.Contains(channels.Manifest, channel => channel.Key == "drsActive" && channel.ValueKind == LapChannelValueKind.Boolean);
            Assert.Equal([1d, 2d], channels.Channels.Time);
            Assert.Equal([100d, 250d], channels.Channels.LapDistance);
            Assert.Equal([120d, 140d], channels.Channels.SpeedKph);
            Assert.Equal([9_500d, 10_100d], channels.Channels.Rpm);
            Assert.Equal([0.65d, 0.72d], channels.Channels.Throttle);
            Assert.Equal([0.12d, 0.08d], channels.Channels.Brake);
            Assert.Equal([-0.15d, 0.2d], channels.Channels.Steering);
            Assert.Equal([1.1d, 1.25d], channels.Channels.LateralG);
            Assert.Equal([-0.2d, 0.05d], channels.Channels.LongitudinalG);
            Assert.Equal([true, false], channels.Channels.DrsActive);
            Assert.Equal([2_000_000d, 1_900_000d], channels.Channels.ErsStoreJoules);
        });
    }

    [Fact]
    public async Task LapChannelsConcurrentRequestsKeepPerLapManifestIndependent()
    {
        await WithApiClientAsync(async (client, connectionString) =>
        {
            var richSessionId = Guid.NewGuid();
            var sparseSessionId = Guid.NewGuid();
            var adapter = new FakeTelemetryAdapter();
            var sparseSample = adapter.CreateSample(TimeSpan.FromSeconds(5), 1, sparseSessionId);
            await SaveSamplesAsync(connectionString, [.. CreateLapChannelSamples(richSessionId), sparseSample]);

            var richRequest = client.GetFromJsonAsync<LapChannelsResponse>(
                $"/api/sessions/{richSessionId}/laps/2/channels",
                JsonOptions);
            var sparseRequest = client.GetFromJsonAsync<LapChannelsResponse>(
                $"/api/sessions/{sparseSessionId}/laps/1/channels",
                JsonOptions);

            var responses = await Task.WhenAll(richRequest, sparseRequest);
            var richChannels = responses[0];
            var sparseChannels = responses[1];

            Assert.NotNull(richChannels);
            Assert.NotNull(sparseChannels);
            Assert.Equal(richSessionId, richChannels.SessionId);
            Assert.Equal(sparseSessionId, sparseChannels.SessionId);
            Assert.Contains(richChannels.Manifest, channel => channel.Key == "ersStoreJoules");
            Assert.DoesNotContain(sparseChannels.Manifest, channel => channel.Key == "ersStoreJoules");
            Assert.NotNull(richChannels.Channels.ErsStoreJoules);
            Assert.Null(sparseChannels.Channels.ErsStoreJoules);
        });
    }

    private static WebApplicationFactory<Program> CreateFactory(string connectionString, int? retainedSampleBlobLimit = null)
    {
        var configuration = new Dictionary<string, string?>
        {
            ["ConnectionStrings:SectorForge"] = connectionString
        };

        if (retainedSampleBlobLimit is not null)
        {
            configuration["Storage:RetainedSampleBlobLimit"] = retainedSampleBlobLimit.Value.ToString();
        }

        return ApiTestFactory.Create(configuration);
    }

    private static async Task WithApiClientAsync(
        Func<HttpClient, string, Task> runAsync,
        int? retainedSampleBlobLimit = null)
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

            factory = CreateFactory(connectionString, retainedSampleBlobLimit);
            client = factory.CreateClient();

            await runAsync(client, connectionString);
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

    private static async Task SaveSamplesAsync(
        string connectionString,
        IReadOnlyList<TelemetrySample> samples,
        int retainedSampleBlobLimit = SqliteTelemetrySessionStore.DefaultRetainedSampleBlobLimit)
    {
        var store = new SqliteTelemetrySessionStore(connectionString, retainedSampleBlobLimit);
        foreach (var sample in samples)
        {
            await store.SaveSampleAsync(sample);
        }
    }

    private static IReadOnlyList<TelemetrySample> CreateLapChannelSamples(Guid sessionId)
    {
        var adapter = new FakeTelemetryAdapter();
        return
        [
            CreateLapChannelSample(
                adapter,
                sessionId,
                sequence: 1,
                currentLapSeconds: 1,
                lapDistanceMeters: 100,
                speedKph: 120,
                rpm: 9_500,
                throttle: 0.65,
                brake: 0.12,
                steering: -0.15,
                lateralG: 1.1,
                longitudinalG: -0.2,
                drsActive: true,
                ersStoreJoules: 2_000_000),
            CreateLapChannelSample(
                adapter,
                sessionId,
                sequence: 2,
                currentLapSeconds: 2,
                lapDistanceMeters: 250,
                speedKph: 140,
                rpm: 10_100,
                throttle: 0.72,
                brake: 0.08,
                steering: 0.2,
                lateralG: 1.25,
                longitudinalG: 0.05,
                drsActive: false,
                ersStoreJoules: 1_900_000)
        ];
    }

    private static TelemetrySample CreateLapChannelSample(
        FakeTelemetryAdapter adapter,
        Guid sessionId,
        long sequence,
        double currentLapSeconds,
        double lapDistanceMeters,
        double speedKph,
        double rpm,
        double throttle,
        double brake,
        double steering,
        double lateralG,
        double longitudinalG,
        bool drsActive,
        double ersStoreJoules)
    {
        var sample = adapter.CreateSample(TimeSpan.FromSeconds(90 + currentLapSeconds), sequence, sessionId);

        return sample with
        {
            Lap = sample.Lap with
            {
                LapNumber = 2,
                CurrentLapTime = TimeSpan.FromSeconds(currentLapSeconds),
                LastLapTime = null,
                LapDistanceMeters = lapDistanceMeters,
                Sector1Time = TimeSpan.FromSeconds(31),
                Sector2Time = TimeSpan.FromSeconds(32),
                Sector3Time = TimeSpan.FromSeconds(33)
            },
            Vehicle = sample.Vehicle with
            {
                SpeedKph = speedKph,
                Rpm = rpm,
                LateralG = lateralG,
                LongitudinalG = longitudinalG
            },
            DriverInput = sample.DriverInput with
            {
                Throttle = throttle,
                Brake = brake,
                Steering = steering,
                DrsActive = drsActive
            },
            PowerUnit = new PowerUnitState(ErsStoreJoules: ersStoreJoules)
        };
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
