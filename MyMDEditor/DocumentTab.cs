using MyMDEditor.Services;

namespace MyMDEditor
{
    /// <summary>One open document: its own editor control (so undo history is per tab), file state and display title.</summary>
    internal sealed class DocumentTab : IDisposable
    {
        private static int _untitledCounter;

        public DocumentTab(RichTextBox editor, FileManagementService? file = null)
        {
            Editor = editor;
            File = file ?? new FileManagementService();
            UntitledNumber = Interlocked.Increment(ref _untitledCounter);
        }

        /// <summary>Stable key used for crash-recovery snapshots.</summary>
        public string Id { get; } = Guid.NewGuid().ToString("N")[..8];

        public RichTextBox Editor { get; }

        public FileManagementService File { get; }

        public int UntitledNumber { get; }

        public string? FilePath => File.CurrentFilePath;

        public string Title => FilePath is { } path ? Path.GetFileName(path) : $"Untitled-{UntitledNumber}";

        public string Tooltip => FilePath ?? Title;

        public bool IsModified => Editor.Modified;

        /// <summary>An untouched, empty, unsaved tab that can be replaced when a file is opened.</summary>
        public bool IsPristine => FilePath is null && !Editor.Modified && Editor.TextLength == 0;

        public void Dispose() => Editor.Dispose();
    }
}
