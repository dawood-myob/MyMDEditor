using System.Diagnostics;
using System.Reflection;

namespace MyMDEditor.UI
{
    /// <summary>User guide, keyboard shortcuts and About page, with a topic list on the left.</summary>
    public sealed class HelpDialog : Form
    {
        public const string DeveloperName = "Dawood Ali";
        public const string DeveloperSite = "www.dawoodali.co.nz";
        public const string DeveloperUrl = "https://www.dawoodali.co.nz";

        public static readonly IReadOnlyList<string> Topics = new[]
        {
            "Getting started",
            "Tabs and files",
            "Layout and panes",
            "Writing and formatting",
            "Preview and export",
            "Keyboard shortcuts",
            "About",
        };

        private readonly ThemePalette _palette;
        private readonly ListBox _topics = new()
        {
            Dock = DockStyle.Fill,
            BorderStyle = BorderStyle.None,
            DrawMode = DrawMode.OwnerDrawFixed,
            IntegralHeight = false,
        };

        private readonly RichTextBox _content = new()
        {
            Dock = DockStyle.Fill,
            ReadOnly = true,
            BorderStyle = BorderStyle.None,
            DetectUrls = true,
            TabStop = false,
        };

        public HelpDialog(ThemePalette palette, string initialTopic)
        {
            _palette = palette;
            Text = "MyMDEditor Help";
            AccessibleName = "Help";
            StartPosition = FormStartPosition.CenterParent;
            ShowInTaskbar = false;
            MinimizeBox = false;
            MaximizeBox = false;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            KeyPreview = true;
            ClientSize = new Size(Dp(900), Dp(600));
            BackColor = palette.Window;
            ForeColor = palette.Text;

            var nav = new Panel { Dock = DockStyle.Left, Width = Dp(210), BackColor = palette.Window, Padding = new Padding(Dp(8), Dp(12), Dp(8), Dp(8)) };
            _topics.Font = new Font("Segoe UI", 10F);
            _topics.ItemHeight = Dp(34);
            _topics.BackColor = palette.Window;
            _topics.ForeColor = palette.Text;
            _topics.AccessibleName = "Help topics";
            _topics.Items.AddRange(Topics.Cast<object>().ToArray());
            _topics.DrawItem += DrawTopic;
            _topics.SelectedIndexChanged += (_, _) => ShowTopic(_topics.SelectedIndex);
            nav.Controls.Add(_topics);

            var footer = new Panel { Dock = DockStyle.Bottom, Height = Dp(40), BackColor = palette.Window };
            var credit = new LinkLabel
            {
                AutoSize = true,
                Text = $"Developed by {DeveloperName}  \u00B7  {DeveloperSite}",
                LinkColor = palette.Link,
                ActiveLinkColor = palette.Accent,
                VisitedLinkColor = palette.Link,
                ForeColor = palette.MutedText,
                Font = new Font("Segoe UI", 9F),
                Location = new Point(Dp(220), Dp(12)),
                AccessibleName = $"Developer website {DeveloperSite}",
            };
            credit.LinkArea = new LinkArea(credit.Text.IndexOf(DeveloperSite, StringComparison.Ordinal), DeveloperSite.Length);
            credit.LinkClicked += (_, _) => OpenDeveloperSite();
            var close = new Button
            {
                Text = "Close",
                DialogResult = DialogResult.OK,
                FlatStyle = FlatStyle.Flat,
                Size = new Size(Dp(90), Dp(28)),
                BackColor = palette.SurfaceAlt,
                ForeColor = palette.Text,
                Anchor = AnchorStyles.Top | AnchorStyles.Right,
            };
            close.FlatAppearance.BorderColor = palette.Border;
            close.Location = new Point(footer.Width - close.Width - Dp(16), Dp(6));
            footer.Controls.Add(close);
            footer.Controls.Add(credit);
            AcceptButton = close;
            CancelButton = close;

            _content.BackColor = palette.Surface;
            _content.ForeColor = palette.Text;
            _content.Font = new Font("Segoe UI", 10.5F);
            _content.AccessibleName = "Help content";
            _content.LinkClicked += (_, e) => OnLinkClicked(e.LinkText);
            var contentHost = new Panel { Dock = DockStyle.Fill, BackColor = palette.Surface, Padding = new Padding(Dp(28), Dp(20), Dp(20), Dp(12)) };
            contentHost.Controls.Add(_content);

            Controls.Add(contentHost);
            Controls.Add(nav);
            Controls.Add(footer);
            ThemeApplier.ApplyTitleBar(this, palette);
            ThemeApplier.ApplyScrollbars(_content, palette);

            var index = Math.Max(0, Topics.ToList().FindIndex(t => t.Equals(initialTopic, StringComparison.OrdinalIgnoreCase)));
            _topics.SelectedIndex = index;
        }

        private int Dp(int value) => (int)Math.Round(value * DeviceDpi / 96.0);

        private void DrawTopic(object? sender, DrawItemEventArgs e)
        {
            if (e.Index < 0)
            {
                return;
            }

            var selected = (e.State & DrawItemState.Selected) != 0;
            using (var back = new SolidBrush(selected ? _palette.SurfaceAlt : _palette.Window))
            {
                e.Graphics.FillRectangle(back, e.Bounds);
            }

            if (selected)
            {
                using var accent = new SolidBrush(_palette.Accent);
                e.Graphics.FillRectangle(accent, e.Bounds.Left, e.Bounds.Top + Dp(5), Dp(3), e.Bounds.Height - Dp(10));
            }

            TextRenderer.DrawText(e.Graphics, Topics[e.Index], e.Font, new Rectangle(e.Bounds.Left + Dp(14), e.Bounds.Top, e.Bounds.Width - Dp(14), e.Bounds.Height),
                selected ? _palette.Text : _palette.MutedText, TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding);
        }

        private void OnLinkClicked(string link)
        {
            if (link.Contains("dawoodali.co.nz", StringComparison.OrdinalIgnoreCase))
            {
                OpenDeveloperSite();
            }
        }

        private static void OpenDeveloperSite()
        {
            try
            {
                Process.Start(new ProcessStartInfo(DeveloperUrl) { UseShellExecute = true });
            }
            catch (Exception ex) when (ex is System.ComponentModel.Win32Exception or InvalidOperationException)
            {
                MessageBox.Show($"Could not open the browser. Visit {DeveloperUrl}", "MyMDEditor", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
        }

        // ---------------------------------------------------------------- Content

        private void ShowTopic(int index)
        {
            if (index < 0)
            {
                return;
            }

            _content.SuspendLayout();
            _content.Clear();
            switch (Topics[index])
            {
                case "Getting started":
                    Title("Getting started");
                    Para("MyMDEditor is a Markdown editor with a live preview. Write on one side and see the finished document on the other, with the outline alongside for quick navigation.");
                    Sub("The window at a glance");
                    Bullet("Ribbon \u2013 the Home, Insert, View, Export and Help pages hold every command. The Outline / Editor / Preview switch sits at the top right.");
                    Bullet("Tab strip \u2013 one tab per open document, just like a browser.");
                    Bullet("Outline \u2013 every heading in the document. Click one to jump straight to it.");
                    Bullet("Editor and Preview \u2013 the Markdown source and its rendered result, kept in step as you type.");
                    Bullet("Status bar \u2013 line, column and word information for the active document.");
                    Sub("First steps");
                    Bullet("Press Ctrl+O to open a Markdown file, or Ctrl+T to start a new one.");
                    Bullet("Start typing. The preview updates automatically.");
                    Bullet("Press Ctrl+S to save. A new document asks where to save it.");
                    Bullet("Press Ctrl+Shift+P at any time to search every command.");
                    break;
                case "Tabs and files":
                    Title("Tabs and files");
                    Para("Every document opens in its own tab, so opening another file never replaces the one you were working on.");
                    Bullet("New tab: Ctrl+T or the + button. Close: Ctrl+W, the x on the tab, or middle-click it.");
                    Bullet("Switch tabs: click one, or use Ctrl+Tab and Ctrl+Shift+Tab.");
                    Bullet("Reorder tabs by dragging them. Each tab keeps its own undo history.");
                    Bullet("A dot on a tab means it has unsaved changes. You are asked before it closes.");
                    Bullet("Opening a file that is already open simply switches to its tab.");
                    Bullet("Right-click a tab for Close Others, Close Tabs to the Right, Copy Full Path and Show in File Explorer.");
                    Sub("Your session is remembered");
                    Para("Open tabs are restored the next time you start the app. If the app ever closes unexpectedly, unsaved work is recovered and offered back to you on the next start.");
                    Sub("Opening files from Windows");
                    Para("Pass a file path to the executable (or use Open with) to open it directly.");
                    break;
                case "Layout and panes":
                    Title("Layout and panes");
                    Para("Show only what you need. The three switch buttons at the top right of the ribbon toggle each pane independently:");
                    Bullet("Outline \u2013 the heading tree on the left.");
                    Bullet("Editor \u2013 the Markdown source.");
                    Bullet("Preview \u2013 the live rendered view.");
                    Para("At least one of Editor or Preview always stays on, so the button for the last visible one is dimmed.");
                    Sub("More layout options (View page)");
                    Bullet("Rotate switches between side-by-side and stacked editor and preview.");
                    Bullet("Drag the dividers to resize panes.");
                    Bullet("Zoom in or out with Ctrl and + / -, and reset with Ctrl+0.");
                    Bullet("Word Wrap, and Dark, Light or System themes.");
                    break;
                case "Writing and formatting":
                    Title("Writing and formatting");
                    Para("Use the Home and Insert pages, or the keyboard.");
                    Bullet("Bold (Ctrl+B), italic (Ctrl+I), strikethrough, inline code and links (Ctrl+K).");
                    Bullet("Headings 1\u20133, bullet, numbered and task lists, and block quotes.");
                    Bullet("Tab and Shift+Tab indent and outdent the current line or the selected lines.");
                    Bullet("Press Enter in a list to continue it automatically.");
                    Bullet("Insert tab: link, image, table, fenced code block and horizontal rule.");
                    Bullet("Find (Ctrl+F) and Replace (Ctrl+H), then F3 / Shift+F3 for next and previous.");
                    Bullet("Go to heading (Ctrl+P). Type : and a number to jump to that line.");
                    Para("Pasting always inserts plain text, so formatting from web pages and Word never leaks into your Markdown.");
                    break;
                case "Preview and export":
                    Title("Preview and export");
                    Para("The preview renders your Markdown as you type, including tables, task lists, code blocks and images, and it follows the line you are editing.");
                    Sub("Export (Export page)");
                    Bullet("HTML \u2013 a standalone web page.");
                    Bullet("Word \u2013 a .docx document.");
                    Bullet("PDF \u2013 a print-ready PDF of the preview.");
                    Para("The theme you choose (dark or light) is used for the preview as well as the editor.");
                    break;
                case "Keyboard shortcuts":
                    Title("Keyboard shortcuts");
                    Sub("Files and tabs");
                    Shortcut("Ctrl+T", "New tab");
                    Shortcut("Ctrl+O", "Open file");
                    Shortcut("Ctrl+S", "Save");
                    Shortcut("Ctrl+Shift+S", "Save As");
                    Shortcut("Ctrl+W", "Close tab");
                    Shortcut("Ctrl+Tab", "Next tab");
                    Shortcut("Ctrl+Shift+Tab", "Previous tab");
                    Sub("Editing");
                    Shortcut("Ctrl+B / Ctrl+I", "Bold / italic");
                    Shortcut("Ctrl+K", "Insert link");
                    Shortcut("Tab / Shift+Tab", "Indent / outdent");
                    Shortcut("Ctrl+Z / Ctrl+Y", "Undo / redo");
                    Shortcut("Ctrl+V", "Paste as plain text");
                    Sub("Navigate and find");
                    Shortcut("Ctrl+F / Ctrl+H", "Find / replace");
                    Shortcut("F3 / Shift+F3", "Next / previous match");
                    Shortcut("Ctrl+P", "Go to heading or line");
                    Shortcut("Ctrl+Shift+P", "Command palette");
                    Sub("View");
                    Shortcut("Ctrl and + / -", "Zoom in / out");
                    Shortcut("Ctrl+0", "Reset zoom");
                    Shortcut("F1", "Open this help");
                    break;
                default:
                    Title("About MyMDEditor");
                    Para("A fast, focused Markdown editor for Windows with live preview, tabs, an outline and export to HTML, Word and PDF.");
                    Sub("Version");
                    Para(VersionText());
                    Sub("Developer");
                    Para($"Designed and developed by {DeveloperName}.");
                    Para($"{DeveloperSite}");
                    Sub("Built with");
                    Bullet(".NET 8 and Windows Forms");
                    Bullet("Markdig for Markdown parsing");
                    Bullet("Microsoft Edge WebView2 for the live preview");
                    break;
            }

            _content.SelectionStart = 0;
            _content.ScrollToCaret();
            _content.ResumeLayout();
        }

        private static string VersionText()
        {
            var version = Assembly.GetExecutingAssembly().GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion
                          ?? Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "1.0";
            var plus = version.IndexOf('+');
            return plus > 0 ? version[..plus] : version;
        }

        private void Append(string text, Font font, Color color, int indent = 0, int hanging = 0, int spaceAfter = 0)
        {
            _content.SelectionStart = _content.TextLength;
            _content.SelectionLength = 0;
            _content.SelectionFont = font;
            _content.SelectionColor = color;
            _content.SelectionIndent = Dp(indent);
            _content.SelectionHangingIndent = Dp(hanging);
            _content.AppendText(text + "\n");
            if (spaceAfter > 0)
            {
                _content.SelectionStart = _content.TextLength;
                _content.SelectionFont = new Font("Segoe UI", spaceAfter / 2F);
                _content.AppendText("\n");
            }
        }

        private void Title(string text) => Append(text, new Font("Segoe UI Semibold", 20F), _palette.Text, spaceAfter: 8);

        private void Sub(string text)
        {
            Append(string.Empty, new Font("Segoe UI", 4F), _palette.Text);
            Append(text, new Font("Segoe UI Semibold", 12.5F), _palette.Accent, spaceAfter: 4);
        }

        private void Para(string text) => Append(text, new Font("Segoe UI", 10.5F), _palette.Text, spaceAfter: 6);

        private void Bullet(string text) => Append("\u2022\t" + text, new Font("Segoe UI", 10.5F), _palette.Text, indent: 22, hanging: 18, spaceAfter: 3);

        private void Shortcut(string keys, string description)
        {
            _content.SelectionTabs = new[] { Dp(210) };
            Append(keys + "\t" + description, new Font("Consolas", 10.5F), _palette.Text, spaceAfter: 3);
        }

        protected override void OnKeyDown(KeyEventArgs e)
        {
            base.OnKeyDown(e);
            if (e.KeyCode == Keys.Escape)
            {
                Close();
            }
        }
    }
}
