using SectorForge.Collector.Adapters;

namespace SectorForge.Core.Tests;

public sealed class TelemetryModelTests
{
    [Fact]
    public void FakeSampleUsesStableSessionIdentityWhenProvided()
    {
        var adapter = new FakeTelemetryAdapter();
        var sessionId = Guid.NewGuid();

        var first = adapter.CreateSample(TimeSpan.Zero, 1, sessionId);
        var second = adapter.CreateSample(TimeSpan.FromSeconds(3), 2, sessionId);

        Assert.Equal(sessionId, first.SessionId);
        Assert.Equal(sessionId, second.SessionId);
        Assert.Equal(first.Session.Id, second.Session.Id);
    }
}
