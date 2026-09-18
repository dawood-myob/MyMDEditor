namespace MyMDEditor
{
    internal static class Program
    {
        /// <summary>
        ///  The main entry point for the application.
        ///  Each launch starts a fully independent instance, so double-clicking
        ///  the executable (or a .md file associated with it) multiple times
        ///  opens multiple separate editor windows/processes.
        /// </summary>
        [STAThread]
        static void Main(string[] args)
        {
            // To customize application configuration such as set high DPI settings or default font,
            // see https://aka.ms/applicationconfiguration.
            ApplicationConfiguration.Initialize();

            var filePathToOpen = args.Length > 0 && File.Exists(args[0]) ? args[0] : null;
            Application.Run(new MarkdownEditorForm(filePathToOpen));
        }
    }
}
