package cc.kokodev.stratpanel.core;

/**
 * TPS and MSPT, measured from the server's ticks. A tick is timed from its start to its end for the MSPT, the time between the
 * starts of ticks gives the TPS over the last 1, 5 and 15 minutes, the same figures as Paper's. Not thread safe: the server
 * thread calls everything.
 */
public final class TickTracker {

  /** How many ticks of the last 15 minutes are remembered, with room for the server ticking a little too fast. */
  private static final int STAMPS = 15 * 60 * 20 + 400;
  public static final int DURATIONS = 100;
  private static final long[] WINDOWS_SECONDS = {60, 300, 900};

  private final long[] stamps = new long[STAMPS];
  private int head;
  private int stored;
  private final long[] durations = new long[DURATIONS];
  private int durationHead;
  private int durationCount;
  private long started;

  /** A tick begins. */
  public void start(long nowNanos) {
    started = nowNanos;
    stamps[head] = nowNanos;
    head = (head + 1) % STAMPS;
    stored = Math.min(stored + 1, STAMPS);
  }

  /** The tick that began with {@link #start} is done. */
  public void end(long nowNanos) {
    if (started == 0) {
      return;
    }
    durations[durationHead] = Math.max(0, nowNanos - started);
    durationHead = (durationHead + 1) % DURATIONS;
    durationCount = Math.min(durationCount + 1, DURATIONS);
  }

  /** Ticks per second over 1, 5 and 15 minutes, or null before the second tick. */
  public double[] tps(long nowNanos) {
    if (stored < 2) {
      return null;
    }
    long oldest = stamps[(head - stored + STAMPS) % STAMPS];
    double[] result = new double[WINDOWS_SECONDS.length];
    for (int i = 0; i < result.length; i++) {
      long window = WINDOWS_SECONDS[i] * 1_000_000_000L;
      long from = Math.max(nowNanos - window, oldest);
      int ticks = 0;
      long first = nowNanos;
      for (int n = 0; n < stored; n++) {
        long stamp = stamps[(head - 1 - n + STAMPS) % STAMPS];
        if (stamp < from) {
          break;
        }
        ticks++;
        first = stamp;
      }
      // N ticks started in an interval that ran from the first of them to now, that is N-1 whole ticks plus the running one.
      double seconds = (nowNanos - first) / 1e9;
      result[i] = ticks < 2 || seconds <= 0 ? 20.0 : Math.min(20.0, (ticks - 1) / seconds);
    }
    return result;
  }

  /** The duration of the last ticks in nanoseconds, null before the first one is done. */
  public long[] tickNanos() {
    if (durationCount == 0) {
      return null;
    }
    long[] result = new long[durationCount];
    for (int i = 0; i < durationCount; i++) {
      result[i] = durations[(durationHead - durationCount + i + DURATIONS) % DURATIONS];
    }
    return result;
  }
}
