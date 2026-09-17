namespace MyMDEditor.Services
{
    /// <summary>
    /// Simple debouncer that delays invocation of an async action until
    /// a period of inactivity has elapsed, canceling any pending invocation.
    /// </summary>
    public sealed class Debouncer : IDisposable
    {
        private readonly System.Windows.Forms.Timer _timer;
        private Func<Task>? _pendingAction;

        public Debouncer(int delayMilliseconds)
        {
            _timer = new System.Windows.Forms.Timer { Interval = delayMilliseconds };
            _timer.Tick += OnTick;
        }

        public void Debounce(Func<Task> action)
        {
            _pendingAction = action;
            _timer.Stop();
            _timer.Start();
        }

        private async void OnTick(object? sender, EventArgs e)
        {
            _timer.Stop();
            var action = _pendingAction;
            _pendingAction = null;
            if (action is not null)
            {
                try
                {
                    await action().ConfigureAwait(true);
                }
                catch
                {
                    // Errors from the debounced action must be handled by the action itself.
                }
            }
        }

        public void Dispose()
        {
            _timer.Tick -= OnTick;
            _timer.Dispose();
        }
    }
}
