package cc.kokodev.stratpanel.core;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import org.junit.jupiter.api.Test;

class TickTrackerTest {

  private static final long MS = 1_000_000L;

  /** Runs ticks that start every {@code interval} ms and last {@code duration} ms, returns the time of the last start. */
  private static long run(TickTracker tracker, int ticks, long intervalMs, long durationMs) {
    long now = 1_000 * MS;
    for (int i = 0; i < ticks; i++) {
      tracker.start(now);
      tracker.end(now + durationMs * MS);
      now += intervalMs * MS;
    }
    return now - intervalMs * MS;
  }

  @Test
  void nothingBeforeTheSecondTick() {
    TickTracker tracker = new TickTracker();
    assertNull(tracker.tps(0));
    assertNull(tracker.tickNanos());
    tracker.start(5);
    assertNull(tracker.tps(5));
  }

  @Test
  void aServerThatKeepsUpHasTwentyTps() {
    TickTracker tracker = new TickTracker();
    long last = run(tracker, 1200, 50, 10);
    double[] tps = tracker.tps(last);
    assertEquals(20.0, tps[0], 0.01);
    assertEquals(20.0, tps[1], 0.01);
    assertEquals(20.0, tps[2], 0.01);
  }

  @Test
  void aSlowServerHasFewerTicksPerSecond() {
    TickTracker tracker = new TickTracker();
    long last = run(tracker, 600, 100, 90);
    assertEquals(10.0, tracker.tps(last)[0], 0.05);
  }

  @Test
  void theOneMinuteFigureForgetsAnOldStall() {
    TickTracker tracker = new TickTracker();
    long start = 1_000 * MS;
    // Two minutes of 5 ticks per second, then two minutes of 20.
    long now = start;
    for (int i = 0; i < 600; i++) {
      tracker.start(now);
      now += 200 * MS;
    }
    for (int i = 0; i < 2400; i++) {
      tracker.start(now);
      now += 50 * MS;
    }
    double[] tps = tracker.tps(now - 50 * MS);
    assertEquals(20.0, tps[0], 0.05);
    // The longer windows still remember the slow part.
    assertEquals(true, tps[2] < 20.0 && tps[2] > 5.0);
  }

  @Test
  void neverReportsMoreThanTwenty() {
    TickTracker tracker = new TickTracker();
    long last = run(tracker, 400, 25, 5);
    assertEquals(20.0, tracker.tps(last)[0], 0.0);
  }

  @Test
  void keepsTheDurationsOfTheLastHundredTicksInOrder() {
    TickTracker tracker = new TickTracker();
    long now = 1_000 * MS;
    for (int i = 1; i <= 130; i++) {
      tracker.start(now);
      tracker.end(now + i * MS);
      now += 50 * MS;
    }
    long[] nanos = tracker.tickNanos();
    assertEquals(TickTracker.DURATIONS, nanos.length);
    assertEquals(31 * MS, nanos[0]);
    assertEquals(130 * MS, nanos[nanos.length - 1]);
  }

  @Test
  void anEndWithoutAStartIsIgnored() {
    TickTracker tracker = new TickTracker();
    tracker.end(10);
    assertNull(tracker.tickNanos());
    tracker.start(100);
    tracker.end(150);
    assertArrayEquals(new long[] {50}, tracker.tickNanos());
  }
}
