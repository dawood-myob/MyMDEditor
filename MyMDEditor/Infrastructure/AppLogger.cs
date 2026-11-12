using System.Text;

namespace MyMDEditor.Infrastructure
{
    /// <summary>
    /// Minimal, dependency-free file logger (one file per day, pruned after two weeks).
    /// Logging must never throw: failures to log are swallowed.
    /// </summary>
    public static class AppLogger
    {
        private static readonly object Gate = new();
        private static string? _directory;
        private static int _initialised;

        public static string? LogDirectory => _directory;

        public static void Initialise(string? directory = null)
        {
            lock (Gate)
            {
                _directory = directory ?? Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MyMDEditor", "logs");

                try
                {
                    Directory.CreateDirectory(_directory);
                    if (Interlocked.Exchange(ref _initialised, 1) == 0)
                    {
                        Prune(_directory, TimeSpan.FromDays(14));
                    }
                }
                catch (Exception)
                {
                    _directory = null;
                }
            }
        }

        public static void Info(string message) => Write("INFO", message, null);

        public static void Warn(string message, Exception? exception = null) => Write("WARN", message, exception);

        public static void Error(string message, Exception? exception = null) => Write("ERROR", message, exception);

        private static void Write(string level, string message, Exception? exception)
        {
            var directory = _directory;
            if (directory is null)
            {
                return;
            }

            try
            {
                var line = new StringBuilder()
                    .Append(DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff"))
                    .Append(" [").Append(level).Append("] ")
                    .Append("[T").Append(Environment.CurrentManagedThreadId).Append("] ")
                    .Append(message);

                if (exception is not null)
                {
                    line.AppendLine().Append(exception);
                }

                line.AppendLine();
                var path = Path.Combine(directory, $"app-{DateTime.Now:yyyyMMdd}.log");

                lock (Gate)
                {
                    File.AppendAllText(path, line.ToString(), Encoding.UTF8);
                }
            }
            catch (Exception)
            {
                // Never let diagnostics take the application down.
            }
        }

        private static void Prune(string directory, TimeSpan maxAge)
        {
            foreach (var file in Directory.EnumerateFiles(directory, "app-*.log"))
            {
                try
                {
                    if (DateTime.UtcNow - File.GetLastWriteTimeUtc(file) > maxAge)
                    {
                        File.Delete(file);
                    }
                }
                catch (IOException)
                {
                }
            }
        }
    }
}
