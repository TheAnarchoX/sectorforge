using SectorForge.Core.Telemetry;

namespace SectorForge.Api.Services;

public sealed class LapChannelService(ITelemetrySessionStore sessionStore)
{
    private static readonly LapChannelManifestEntry TimeChannel = new(
        Key: "time",
        Label: "Lap time",
        ValueKind: LapChannelValueKind.Number,
        Unit: "s");

    private static readonly LapChannelManifestEntry LapDistanceChannel = new(
        Key: "lapDistance",
        Label: "Lap distance",
        ValueKind: LapChannelValueKind.Number,
        Unit: "m");

    private static readonly LapChannelManifestEntry SpeedChannel = new(
        Key: "speedKph",
        Label: "Speed",
        ValueKind: LapChannelValueKind.Number,
        Unit: "kph");

    private static readonly LapChannelManifestEntry RpmChannel = new(
        Key: "rpm",
        Label: "RPM",
        ValueKind: LapChannelValueKind.Number,
        Unit: "rpm");

    private static readonly LapChannelManifestEntry ThrottleChannel = new(
        Key: "throttle",
        Label: "Throttle",
        ValueKind: LapChannelValueKind.Number,
        Unit: "ratio");

    private static readonly LapChannelManifestEntry BrakeChannel = new(
        Key: "brake",
        Label: "Brake",
        ValueKind: LapChannelValueKind.Number,
        Unit: "ratio");

    private static readonly LapChannelManifestEntry SteeringChannel = new(
        Key: "steering",
        Label: "Steering",
        ValueKind: LapChannelValueKind.Number,
        Unit: "ratio");

    private static readonly LapChannelManifestEntry LateralGChannel = new(
        Key: "lateralG",
        Label: "Lateral G",
        ValueKind: LapChannelValueKind.Number,
        Unit: "g");

    private static readonly LapChannelManifestEntry LongitudinalGChannel = new(
        Key: "longitudinalG",
        Label: "Longitudinal G",
        ValueKind: LapChannelValueKind.Number,
        Unit: "g");

    private static readonly LapChannelManifestEntry DrsActiveChannel = new(
        Key: "drsActive",
        Label: "DRS active",
        ValueKind: LapChannelValueKind.Boolean);

    private static readonly LapChannelManifestEntry ErsStoreChannel = new(
        Key: "ersStoreJoules",
        Label: "ERS store",
        ValueKind: LapChannelValueKind.Number,
        Unit: "J");

    public async Task<LapChannelLookupResult> GetLapChannelsAsync(
        Guid sessionId,
        int lapNumber,
        CancellationToken cancellationToken = default)
    {
        var lapSamples = await sessionStore.GetLapSamplesAsync(sessionId, lapNumber, cancellationToken);
        if (lapSamples is null)
        {
            return new LapChannelLookupResult(LapChannelLookupStatus.SessionNotFound);
        }

        if (lapSamples.Lap is null)
        {
            return new LapChannelLookupResult(LapChannelLookupStatus.LapNotFound);
        }

        if (lapSamples.Samples.Count == 0)
        {
            return new LapChannelLookupResult(LapChannelLookupStatus.LapNotRetained);
        }

        return new LapChannelLookupResult(
            LapChannelLookupStatus.Found,
            BuildResponse(lapSamples.Lap, lapSamples.Samples));
    }

    private static LapChannelsResponse BuildResponse(LapSummary lap, IReadOnlyList<TelemetrySample> samples)
    {
        var orderedSamples = samples
            .OrderBy(sample => sample.Sequence)
            .ThenBy(sample => sample.Timestamp)
            .ToArray();

        var lapDistance = OptionalNumberChannel(orderedSamples, sample => sample.Lap.LapDistanceMeters);
        var lateralG = OptionalNumberChannel(orderedSamples, sample => sample.Vehicle.LateralG);
        var longitudinalG = OptionalNumberChannel(orderedSamples, sample => sample.Vehicle.LongitudinalG);
        var drsActive = OptionalBooleanChannel(orderedSamples, sample => sample.DriverInput.DrsActive);
        var ersStoreJoules = OptionalNumberChannel(orderedSamples, sample => sample.PowerUnit?.ErsStoreJoules);

        var manifest = new List<LapChannelManifestEntry> { TimeChannel };
        AddIfPresent(manifest, LapDistanceChannel, lapDistance);
        manifest.AddRange([SpeedChannel, RpmChannel, ThrottleChannel, BrakeChannel, SteeringChannel]);
        AddIfPresent(manifest, LateralGChannel, lateralG);
        AddIfPresent(manifest, LongitudinalGChannel, longitudinalG);
        AddIfPresent(manifest, DrsActiveChannel, drsActive);
        AddIfPresent(manifest, ErsStoreChannel, ersStoreJoules);

        return new LapChannelsResponse(
            SessionId: lap.SessionId,
            LapNumber: lap.LapNumber,
            LapTime: lap.LapTime ?? LastValue(orderedSamples, sample => sample.Lap.LastLapTime ?? sample.Lap.CurrentLapTime),
            BestLapTime: lap.BestLapTime,
            Sector1Time: LastValue(orderedSamples, sample => sample.Lap.Sector1Time),
            Sector2Time: LastValue(orderedSamples, sample => sample.Lap.Sector2Time),
            Sector3Time: LastValue(orderedSamples, sample => sample.Lap.Sector3Time),
            SampleCount: orderedSamples.Length,
            Manifest: manifest,
            Channels: new LapChannelData(
                Time: orderedSamples.Select(GetLapTimeSeconds).ToArray(),
                SpeedKph: orderedSamples.Select(sample => sample.Vehicle.SpeedKph).ToArray(),
                Rpm: orderedSamples.Select(sample => sample.Vehicle.Rpm).ToArray(),
                Throttle: orderedSamples.Select(sample => sample.DriverInput.Throttle).ToArray(),
                Brake: orderedSamples.Select(sample => sample.DriverInput.Brake).ToArray(),
                Steering: orderedSamples.Select(sample => sample.DriverInput.Steering).ToArray(),
                LapDistance: lapDistance,
                LateralG: lateralG,
                LongitudinalG: longitudinalG,
                DrsActive: drsActive,
                ErsStoreJoules: ersStoreJoules));
    }

    private static double? GetLapTimeSeconds(TelemetrySample sample)
    {
        return sample.Lap.CurrentLapTime?.TotalSeconds;
    }

    private static IReadOnlyList<double?>? OptionalNumberChannel(
        IReadOnlyList<TelemetrySample> samples,
        Func<TelemetrySample, double?> selector)
    {
        var values = samples.Select(selector).ToArray();
        return values.Any(value => value.HasValue) ? values : null;
    }

    private static IReadOnlyList<bool?>? OptionalBooleanChannel(
        IReadOnlyList<TelemetrySample> samples,
        Func<TelemetrySample, bool?> selector)
    {
        var values = samples.Select(selector).ToArray();
        return values.Any(value => value.HasValue) ? values : null;
    }

    private static TimeSpan? LastValue(
        IReadOnlyList<TelemetrySample> samples,
        Func<TelemetrySample, TimeSpan?> selector)
    {
        for (var index = samples.Count - 1; index >= 0; index--)
        {
            var value = selector(samples[index]);
            if (value.HasValue)
            {
                return value;
            }
        }

        return null;
    }

    private static void AddIfPresent<T>(
        List<LapChannelManifestEntry> manifest,
        LapChannelManifestEntry entry,
        IReadOnlyList<T?>? values)
        where T : struct
    {
        if (values is not null)
        {
            manifest.Add(entry);
        }
    }
}

public enum LapChannelLookupStatus
{
    Found,
    SessionNotFound,
    LapNotFound,
    LapNotRetained
}

public sealed record LapChannelLookupResult(
    LapChannelLookupStatus Status,
    LapChannelsResponse? Response = null);
