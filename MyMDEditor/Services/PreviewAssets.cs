using System.Net;
using System.Reflection;

namespace MyMDEditor.Services
{
    /// <summary>Loads the embedded preview resources and assembles preview/export HTML documents.</summary>
    public static class PreviewAssets
    {
        public const string DarkTheme = "dark";
        public const string LightTheme = "light";
        public const string HighContrastTheme = "hc";

        private static readonly Lazy<string> Css = new(() => ReadResource("preview.css"));
        private static readonly Lazy<string> Script = new(() => ReadResource("preview.js"));
        private static readonly Lazy<string> ShellTemplate = new(() => ReadResource("preview.html"));

        /// <summary>Per-process nonce that allows only our own script to run inside the preview (CSP).</summary>
        public static string Nonce { get; } = Guid.NewGuid().ToString("N");

        public static string BuildShellHtml(string theme) =>
            ShellTemplate.Value
                .Replace("{{THEME}}", NormalizeTheme(theme))
                .Replace("{{NONCE}}", Nonce)
                .Replace("{{CSS}}", Css.Value)
                .Replace("{{JS}}", Script.Value);

        /// <summary>A self-contained, script-free HTML document suitable for export or printing.</summary>
        public static string BuildStandaloneDocument(string title, string bodyHtml, string theme = LightTheme) =>
            $$"""
            <!DOCTYPE html>
            <html lang="en" data-theme="{{NormalizeTheme(theme)}}">
            <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>{{WebUtility.HtmlEncode(title)}}</title>
            <style>
            {{Css.Value}}
            </style>
            </head>
            <body>
            <article class="markdown-body">
            {{bodyHtml}}
            </article>
            </body>
            </html>
            """;

        public static string NormalizeTheme(string? theme) => theme switch
        {
            DarkTheme => DarkTheme,
            HighContrastTheme => HighContrastTheme,
            _ => LightTheme
        };

        private static string ReadResource(string fileName)
        {
            var assembly = Assembly.GetExecutingAssembly();
            var name = $"MyMDEditor.Resources.Preview.{fileName}";
            using var stream = assembly.GetManifestResourceStream(name)
                ?? throw new InvalidOperationException($"Embedded resource '{name}' was not found.");
            using var reader = new StreamReader(stream);
            return reader.ReadToEnd();
        }
    }
}
