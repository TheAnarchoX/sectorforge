using System.Runtime.CompilerServices;
using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Data.Sqlite;
using SectorForge.Core.Telemetry;

namespace SectorForge.Infrastructure.Storage;

public sealed class SqliteTelemetrySessionStore : ITelemetrySessionStore
{
    public const int DefaultRetainedSampleBlobLimit = 1800;

    private static readonly JsonSerializerOptions JsonOptions = CreateJsonOptions();
    private readonly string _connectionString;
    private readonly int _retainedSampleBlobLimit;
    private readonly SemaphoreSlim _schemaGate = new(1, 1);
    private bool _schemaReady;

    public SqliteTelemetrySessionStore(string connectionString, int retainedSampleBlobLimit = DefaultRetainedSampleBlobLimit)
    {
        _connectionString = string.IsNullOrWhiteSpace(connectionString)
            ? throw new ArgumentException("A SQLite connection string is required.", nameof(connectionString))
            : connectionString;
        _retainedSampleBlobLimit = retainedSampleBlobLimit >= 0
            ? retainedSampleBlobLimit
            : throw new ArgumentOutOfRangeException(nameof(retainedSampleBlobLimit), retainedSampleBlobLimit, "The retained sample blob limit must be zero or greater.");
    }

    public static string CreateDefaultConnectionString()
    {
        var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        var root = string.IsNullOrWhiteSpace(localAppData)
            ? AppContext.BaseDirectory
            : localAppData;
        var dataDirectory = Path.Combine(root, "SectorForge");
        Directory.CreateDirectory(dataDirectory);

        return new SqliteConnectionStringBuilder
        {
            DataSource = Path.Combine(dataDirectory, "sectorforge.db"),
            Mode = SqliteOpenMode.ReadWriteCreate
        }.ToString();
    }

    public async Task UpsertSessionAsync(TelemetrySample sample, CancellationToken cancellationToken = default)
    {
        await EnsureDatabaseAsync(cancellationToken);

        await using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);
        await UpsertSessionAsync(connection, transaction: null, sample, incrementSampleCount: false, cancellationToken);
    }

    public async Task SaveSampleAsync(TelemetrySample sample, CancellationToken cancellationToken = default)
    {
        await EnsureDatabaseAsync(cancellationToken);

        await using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);
        await using var transaction = (SqliteTransaction)await connection.BeginTransactionAsync(cancellationToken);

        await UpsertSessionAsync(connection, transaction, sample, incrementSampleCount: true, cancellationToken);
        await UpsertLapAsync(connection, transaction, sample, cancellationToken);
        await InsertSampleAsync(connection, transaction, sample, cancellationToken);
        await PruneSampleBlobsAsync(connection, transaction, sample.SessionId, _retainedSampleBlobLimit, cancellationToken);

        await transaction.CommitAsync(cancellationToken);
    }

    public async IAsyncEnumerable<TelemetrySample> StreamSessionSamplesAsync(
        Guid sessionId,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        await EnsureDatabaseAsync(cancellationToken);

        await using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT payload_json
            FROM telemetry_sample_blobs
            WHERE session_id = $sessionId
            ORDER BY sequence ASC, id ASC;
            """;
        Add(command, "$sessionId", sessionId.ToString());

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var sample = JsonSerializer.Deserialize<TelemetrySample>(reader.GetString(0), JsonOptions);
            if (sample is not null)
            {
                yield return sample;
            }
        }
    }

    public async Task<IReadOnlyList<TelemetrySessionSummary>> ListSessionsAsync(CancellationToken cancellationToken = default)
    {
        await EnsureDatabaseAsync(cancellationToken);

        await using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT id, game, source_name, track_name, car_name, started_at, last_seen_at, best_lap_ticks, sample_count
            FROM sessions
            ORDER BY last_seen_at DESC
            LIMIT 100;
            """;

        var sessions = new List<TelemetrySessionSummary>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            sessions.Add(ReadSessionSummary(reader));
        }

        return sessions;
    }

    public async Task<TelemetrySessionDetails?> GetSessionAsync(Guid sessionId, CancellationToken cancellationToken = default)
    {
        await EnsureDatabaseAsync(cancellationToken);

        await using var connection = new SqliteConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);

        var session = await GetSessionSummaryAsync(connection, sessionId, cancellationToken);
        if (session is null)
        {
            return null;
        }

        var laps = await GetLapSummariesAsync(connection, sessionId, cancellationToken);
        var samples = await GetRecentSamplesAsync(connection, sessionId, cancellationToken);

        return new TelemetrySessionDetails(session, laps, samples);
    }

    private async Task EnsureDatabaseAsync(CancellationToken cancellationToken)
    {
        if (_schemaReady)
        {
            return;
        }

        await _schemaGate.WaitAsync(cancellationToken);
        try
        {
            if (_schemaReady)
            {
                return;
            }

            EnsureDataDirectory();

            await using var connection = new SqliteConnection(_connectionString);
            await connection.OpenAsync(cancellationToken);
            await using var command = connection.CreateCommand();
            command.CommandText = """
                PRAGMA journal_mode = WAL;

                CREATE TABLE IF NOT EXISTS sessions (
                    id TEXT PRIMARY KEY,
                    game TEXT NOT NULL,
                    source_name TEXT NULL,
                    track_name TEXT NULL,
                    car_name TEXT NULL,
                    started_at TEXT NOT NULL,
                    last_seen_at TEXT NOT NULL,
                    best_lap_ticks INTEGER NULL,
                    sample_count INTEGER NOT NULL DEFAULT 0
                );

                CREATE TABLE IF NOT EXISTS lap_summaries (
                    session_id TEXT NOT NULL,
                    lap_number INTEGER NOT NULL,
                    lap_time_ticks INTEGER NULL,
                    best_lap_ticks INTEGER NULL,
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY (session_id, lap_number)
                );

                CREATE TABLE IF NOT EXISTS telemetry_sample_blobs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    sequence INTEGER NOT NULL,
                    timestamp TEXT NOT NULL,
                    payload_json TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS ix_telemetry_sample_blobs_session_sequence
                ON telemetry_sample_blobs(session_id, sequence);
                """;
            await command.ExecuteNonQueryAsync(cancellationToken);
            _schemaReady = true;
        }
        finally
        {
            _schemaGate.Release();
        }
    }

    private void EnsureDataDirectory()
    {
        var builder = new SqliteConnectionStringBuilder(_connectionString);
        var dataSource = builder.DataSource;
        if (string.IsNullOrWhiteSpace(dataSource) || string.Equals(dataSource, ":memory:", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        var directory = Path.GetDirectoryName(Path.GetFullPath(dataSource));
        if (!string.IsNullOrWhiteSpace(directory))
        {
            Directory.CreateDirectory(directory);
        }
    }

    private static async Task UpsertSessionAsync(
        SqliteConnection connection,
        SqliteTransaction? transaction,
        TelemetrySample sample,
        bool incrementSampleCount,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            INSERT INTO sessions (id, game, source_name, track_name, car_name, started_at, last_seen_at, best_lap_ticks, sample_count)
            VALUES ($id, $game, $sourceName, $trackName, $carName, $startedAt, $lastSeenAt, $bestLapTicks, $sampleCount)
            ON CONFLICT(id) DO UPDATE SET
                game = excluded.game,
                source_name = excluded.source_name,
                track_name = COALESCE(excluded.track_name, sessions.track_name),
                car_name = COALESCE(excluded.car_name, sessions.car_name),
                last_seen_at = excluded.last_seen_at,
                best_lap_ticks = COALESCE(excluded.best_lap_ticks, sessions.best_lap_ticks),
                sample_count = sessions.sample_count + $sampleIncrement;
            """;

        Add(command, "$id", sample.SessionId.ToString());
        Add(command, "$game", sample.Source.Game.ToString());
        Add(command, "$sourceName", sample.Source.DisplayName);
        Add(command, "$trackName", sample.Track.TrackName);
        Add(command, "$carName", sample.Vehicle.CarName);
        Add(command, "$startedAt", sample.Session.StartedAt.ToString("O", CultureInfo.InvariantCulture));
        Add(command, "$lastSeenAt", sample.Timestamp.ToString("O", CultureInfo.InvariantCulture));
        Add(command, "$bestLapTicks", sample.Lap.BestLapTime?.Ticks);
        Add(command, "$sampleCount", incrementSampleCount ? 1 : 0);
        Add(command, "$sampleIncrement", incrementSampleCount ? 1 : 0);

        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static async Task UpsertLapAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        TelemetrySample sample,
        CancellationToken cancellationToken)
    {
        if (sample.Lap.LapNumber is null)
        {
            return;
        }

        await using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            INSERT INTO lap_summaries (session_id, lap_number, lap_time_ticks, best_lap_ticks, updated_at)
            VALUES ($sessionId, $lapNumber, $lapTimeTicks, $bestLapTicks, $updatedAt)
            ON CONFLICT(session_id, lap_number) DO UPDATE SET
                lap_time_ticks = COALESCE(excluded.lap_time_ticks, lap_summaries.lap_time_ticks),
                best_lap_ticks = COALESCE(excluded.best_lap_ticks, lap_summaries.best_lap_ticks),
                updated_at = excluded.updated_at;
            """;

        Add(command, "$sessionId", sample.SessionId.ToString());
        Add(command, "$lapNumber", sample.Lap.LapNumber.Value);
        Add(command, "$lapTimeTicks", sample.Lap.LastLapTime?.Ticks ?? sample.Lap.CurrentLapTime?.Ticks);
        Add(command, "$bestLapTicks", sample.Lap.BestLapTime?.Ticks);
        Add(command, "$updatedAt", sample.Timestamp.ToString("O", CultureInfo.InvariantCulture));

        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static async Task InsertSampleAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        TelemetrySample sample,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            INSERT INTO telemetry_sample_blobs (session_id, sequence, timestamp, payload_json)
            VALUES ($sessionId, $sequence, $timestamp, $payloadJson);
            """;

        Add(command, "$sessionId", sample.SessionId.ToString());
        Add(command, "$sequence", sample.Sequence);
        Add(command, "$timestamp", sample.Timestamp.ToString("O", CultureInfo.InvariantCulture));
        Add(command, "$payloadJson", JsonSerializer.Serialize(sample, JsonOptions));

        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static async Task PruneSampleBlobsAsync(
        SqliteConnection connection,
        SqliteTransaction transaction,
        Guid sessionId,
        int retainedSampleBlobLimit,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            DELETE FROM telemetry_sample_blobs
            WHERE session_id = $sessionId
              AND id IN (
                  SELECT id
                  FROM telemetry_sample_blobs
                  WHERE session_id = $sessionId
                  ORDER BY sequence DESC, id DESC
                  LIMIT -1 OFFSET $retainedSampleBlobLimit
              );
            """;

        Add(command, "$sessionId", sessionId.ToString());
        Add(command, "$retainedSampleBlobLimit", retainedSampleBlobLimit);

        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static async Task<TelemetrySessionSummary?> GetSessionSummaryAsync(
        SqliteConnection connection,
        Guid sessionId,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT id, game, source_name, track_name, car_name, started_at, last_seen_at, best_lap_ticks, sample_count
            FROM sessions
            WHERE id = $id;
            """;
        Add(command, "$id", sessionId.ToString());

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken) ? ReadSessionSummary(reader) : null;
    }

    private static async Task<IReadOnlyList<LapSummary>> GetLapSummariesAsync(
        SqliteConnection connection,
        Guid sessionId,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT session_id, lap_number, lap_time_ticks, best_lap_ticks, updated_at
            FROM lap_summaries
            WHERE session_id = $sessionId
            ORDER BY lap_number DESC
            LIMIT 100;
            """;
        Add(command, "$sessionId", sessionId.ToString());

        var laps = new List<LapSummary>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            laps.Add(new LapSummary(
                SessionId: Guid.Parse(reader.GetString(0)),
                LapNumber: reader.GetInt32(1),
                LapTime: reader.IsDBNull(2) ? null : TimeSpan.FromTicks(reader.GetInt64(2)),
                BestLapTime: reader.IsDBNull(3) ? null : TimeSpan.FromTicks(reader.GetInt64(3)),
                UpdatedAt: DateTimeOffset.Parse(reader.GetString(4), CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind)));
        }

        return laps;
    }

    private static async Task<IReadOnlyList<TelemetrySample>> GetRecentSamplesAsync(
        SqliteConnection connection,
        Guid sessionId,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT payload_json
            FROM telemetry_sample_blobs
            WHERE session_id = $sessionId
            ORDER BY sequence DESC
            LIMIT 300;
            """;
        Add(command, "$sessionId", sessionId.ToString());

        var samples = new List<TelemetrySample>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var sample = JsonSerializer.Deserialize<TelemetrySample>(reader.GetString(0), JsonOptions);
            if (sample is not null)
            {
                samples.Add(sample);
            }
        }

        samples.Reverse();
        return samples;
    }

    private static TelemetrySessionSummary ReadSessionSummary(SqliteDataReader reader)
    {
        var game = Enum.TryParse<GameId>(reader.GetString(1), out var parsedGame)
            ? parsedGame
            : GameId.Unknown;

        return new TelemetrySessionSummary(
            Id: Guid.Parse(reader.GetString(0)),
            Game: game,
            SourceName: reader.IsDBNull(2) ? null : reader.GetString(2),
            TrackName: reader.IsDBNull(3) ? null : reader.GetString(3),
            CarName: reader.IsDBNull(4) ? null : reader.GetString(4),
            StartedAt: DateTimeOffset.Parse(reader.GetString(5), CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind),
            LastSeenAt: DateTimeOffset.Parse(reader.GetString(6), CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind),
            BestLapTime: reader.IsDBNull(7) ? null : TimeSpan.FromTicks(reader.GetInt64(7)),
            SampleCount: reader.GetInt64(8));
    }

    private static void Add(SqliteCommand command, string name, object? value)
    {
        command.Parameters.AddWithValue(name, value ?? DBNull.Value);
    }

    private static JsonSerializerOptions CreateJsonOptions()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        options.Converters.Add(new JsonStringEnumConverter());
        return options;
    }
}
