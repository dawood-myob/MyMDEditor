using System.Runtime.InteropServices;
using MyMDEditor.Services;

namespace MyMDEditor.UI
{
    /// <summary>Colour palette for one UI theme. Editor syntax colours live alongside chrome colours.</summary>
    public sealed record ThemePalette(
        string Name,
        string PreviewTheme,
        bool IsDark,
        Color Window,
        Color Surface,
        Color SurfaceAlt,
        Color Border,
        Color Text,
        Color MutedText,
        Color Accent,
        Color AccentText,
        Color EditorBack,
        Color EditorText,
        Color CaretLine,
        Color Selection,
        Color LineNumber,
        Color Heading,
        Color Emphasis,
        Color Code,
        Color Link,
        Color Quote,
        Color ListMarker,
        Color FindMatch,
        Color FindCurrent,
        Color SyncFlash)
    {
        public static ThemePalette Dark { get; } = new(
            "dark", PreviewAssets.DarkTheme, true,
            Window: Color.FromArgb(37, 37, 38), Surface: Color.FromArgb(45, 45, 48), SurfaceAlt: Color.FromArgb(51, 51, 55),
            Border: Color.FromArgb(70, 70, 74), Text: Color.FromArgb(230, 230, 230), MutedText: Color.FromArgb(170, 170, 175),
            Accent: Color.FromArgb(0, 122, 204), AccentText: Color.White,
            EditorBack: Color.FromArgb(30, 30, 30), EditorText: Color.FromArgb(212, 212, 212),
            CaretLine: Color.FromArgb(42, 45, 46), Selection: Color.FromArgb(38, 79, 120), LineNumber: Color.FromArgb(133, 133, 133),
            Heading: Color.FromArgb(86, 156, 214), Emphasis: Color.FromArgb(197, 134, 192), Code: Color.FromArgb(206, 145, 120),
            Link: Color.FromArgb(78, 201, 176), Quote: Color.FromArgb(106, 153, 85), ListMarker: Color.FromArgb(220, 220, 170),
            FindMatch: Color.FromArgb(155, 125, 0), FindCurrent: Color.FromArgb(255, 150, 50), SyncFlash: Color.FromArgb(255, 200, 0));

        public static ThemePalette Light { get; } = new(
            "light", PreviewAssets.LightTheme, false,
            Window: Color.FromArgb(243, 243, 243), Surface: Color.FromArgb(248, 248, 248), SurfaceAlt: Color.FromArgb(235, 235, 235),
            Border: Color.FromArgb(210, 210, 210), Text: Color.FromArgb(30, 30, 30), MutedText: Color.FromArgb(96, 96, 96),
            Accent: Color.FromArgb(0, 95, 184), AccentText: Color.White,
            EditorBack: Color.White, EditorText: Color.FromArgb(31, 35, 40),
            CaretLine: Color.FromArgb(245, 247, 250), Selection: Color.FromArgb(173, 214, 255), LineNumber: Color.FromArgb(110, 118, 129),
            Heading: Color.FromArgb(0, 92, 197), Emphasis: Color.FromArgb(130, 30, 140), Code: Color.FromArgb(163, 21, 21),
            Link: Color.FromArgb(9, 105, 218), Quote: Color.FromArgb(0, 128, 0), ListMarker: Color.FromArgb(150, 90, 0),
            FindMatch: Color.FromArgb(255, 229, 143), FindCurrent: Color.FromArgb(255, 150, 50), SyncFlash: Color.FromArgb(255, 200, 0));

        /// <summary>Follows Windows' High Contrast mode by using system colours throughout.</summary>
        public static ThemePalette HighContrast => new(
            "hc", PreviewAssets.HighContrastTheme, SystemColors.Window.GetBrightness() < 0.5f,
            Window: SystemColors.Window, Surface: SystemColors.Window, SurfaceAlt: SystemColors.Window,
            Border: SystemColors.WindowText, Text: SystemColors.WindowText, MutedText: SystemColors.WindowText,
            Accent: SystemColors.Highlight, AccentText: SystemColors.HighlightText,
            EditorBack: SystemColors.Window, EditorText: SystemColors.WindowText,
            CaretLine: SystemColors.Window, Selection: SystemColors.Highlight, LineNumber: SystemColors.WindowText,
            Heading: SystemColors.WindowText, Emphasis: SystemColors.WindowText, Code: SystemColors.WindowText,
            Link: SystemColors.HotTrack, Quote: SystemColors.WindowText, ListMarker: SystemColors.WindowText,
            FindMatch: SystemColors.Highlight, FindCurrent: SystemColors.HotTrack, SyncFlash: SystemColors.Highlight);

        /// <summary>Resolves a settings value ("dark", "light", "system") to a palette.</summary>
        public static ThemePalette Resolve(string setting)
        {
            if (SystemInformation.HighContrast)
            {
                return HighContrast;
            }

            return setting switch
            {
                "light" => Light,
                "system" => IsSystemDark() ? Dark : Light,
                _ => Dark
            };
        }

        public static bool IsSystemDark()
        {
            try
            {
                using var key = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize");
                return key?.GetValue("AppsUseLightTheme") is int value && value == 0;
            }
            catch (Exception)
            {
                return false;
            }
        }
    }

    /// <summary>Applies a palette to WinForms chrome (menus, tool strips, panels).</summary>
    public static class ThemeApplier
    {
        [DllImport("dwmapi.dll")]
        private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);

        public static void ApplyTitleBar(Form form, ThemePalette palette)
        {
            if (!form.IsHandleCreated)
            {
                return;
            }

            try
            {
                var dark = palette.IsDark ? 1 : 0;
                _ = DwmSetWindowAttribute(form.Handle, 20, ref dark, sizeof(int)); // DWMWA_USE_IMMERSIVE_DARK_MODE
            }
            catch (Exception)
            {
                // Not supported on older Windows builds.
            }
        }

        public static void ApplyToolStrip(ToolStrip strip, ThemePalette palette, Color? back = null)
        {
            strip.Renderer = new ThemedRenderer(palette);
            strip.BackColor = back ?? palette.Surface;
            strip.ForeColor = palette.Text;
            ApplyItems(strip.Items, palette);
        }

        private static void ApplyItems(ToolStripItemCollection items, ThemePalette palette)
        {
            foreach (ToolStripItem item in items)
            {
                item.ForeColor = palette.Text;
                if (item is ToolStripDropDownItem dropDown)
                {
                    dropDown.DropDown.BackColor = palette.Surface;
                    dropDown.DropDown.Renderer = new ThemedRenderer(palette);
                    ApplyItems(dropDown.DropDownItems, palette);
                }
            }
        }

        private sealed class ThemedRenderer : ToolStripProfessionalRenderer
        {
            private readonly ThemePalette _palette;

            public ThemedRenderer(ThemePalette palette) : base(new ThemedColorTable(palette))
            {
                _palette = palette;
                RoundedEdges = false;
            }

            protected override void OnRenderItemText(ToolStripItemTextRenderEventArgs e)
            {
                e.TextColor = e.Item.Enabled ? (e.Item.Selected && e.Item is ToolStripMenuItem ? _palette.AccentText : _palette.Text) : _palette.MutedText;
                base.OnRenderItemText(e);
            }

            protected override void OnRenderArrow(ToolStripArrowRenderEventArgs e)
            {
                e.ArrowColor = _palette.Text;
                base.OnRenderArrow(e);
            }

            protected override void OnRenderItemCheck(ToolStripItemImageRenderEventArgs e)
            {
                var rect = new Rectangle(e.ImageRectangle.X - 2, e.ImageRectangle.Y - 2, e.ImageRectangle.Width + 4, e.ImageRectangle.Height + 4);
                using var back = new SolidBrush(_palette.SurfaceAlt);
                e.Graphics.FillRectangle(back, rect);
                TextRenderer.DrawText(e.Graphics, "\u2713", e.Item.Font, rect, _palette.Text, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
            }

            protected override void OnRenderButtonBackground(ToolStripItemRenderEventArgs e)
            {
                if (e.Item is ToolStripButton { Checked: true } button)
                {
                    using var brush = new SolidBrush(_palette.Accent);
                    e.Graphics.FillRectangle(brush, new Rectangle(Point.Empty, button.Size));
                    return;
                }

                base.OnRenderButtonBackground(e);
            }
        }

        private sealed class ThemedColorTable : ProfessionalColorTable
        {
            private readonly ThemePalette _p;

            public ThemedColorTable(ThemePalette palette)
            {
                _p = palette;
                UseSystemColors = false;
            }

            public override Color MenuItemSelected => _p.Accent;
            public override Color MenuItemSelectedGradientBegin => _p.Accent;
            public override Color MenuItemSelectedGradientEnd => _p.Accent;
            public override Color MenuItemPressedGradientBegin => _p.SurfaceAlt;
            public override Color MenuItemPressedGradientEnd => _p.SurfaceAlt;
            public override Color MenuItemBorder => _p.Accent;
            public override Color MenuBorder => _p.Border;
            public override Color MenuStripGradientBegin => _p.Surface;
            public override Color MenuStripGradientEnd => _p.Surface;
            public override Color ToolStripDropDownBackground => _p.Surface;
            public override Color ImageMarginGradientBegin => _p.Surface;
            public override Color ImageMarginGradientMiddle => _p.Surface;
            public override Color ImageMarginGradientEnd => _p.Surface;
            public override Color ToolStripGradientBegin => _p.Surface;
            public override Color ToolStripGradientMiddle => _p.Surface;
            public override Color ToolStripGradientEnd => _p.Surface;
            public override Color ToolStripBorder => _p.Surface;
            public override Color StatusStripGradientBegin => _p.Accent;
            public override Color StatusStripGradientEnd => _p.Accent;
            public override Color SeparatorDark => _p.Border;
            public override Color SeparatorLight => _p.Border;
            public override Color ButtonSelectedHighlight => _p.SurfaceAlt;
            public override Color ButtonSelectedGradientBegin => _p.SurfaceAlt;
            public override Color ButtonSelectedGradientMiddle => _p.SurfaceAlt;
            public override Color ButtonSelectedGradientEnd => _p.SurfaceAlt;
            public override Color ButtonSelectedBorder => _p.Accent;
            public override Color ButtonPressedGradientBegin => _p.Accent;
            public override Color ButtonPressedGradientMiddle => _p.Accent;
            public override Color ButtonPressedGradientEnd => _p.Accent;
            public override Color ButtonCheckedGradientBegin => _p.Accent;
            public override Color ButtonCheckedGradientMiddle => _p.Accent;
            public override Color ButtonCheckedGradientEnd => _p.Accent;
            public override Color CheckBackground => _p.SurfaceAlt;
            public override Color CheckSelectedBackground => _p.SurfaceAlt;
            public override Color CheckPressedBackground => _p.SurfaceAlt;
            public override Color OverflowButtonGradientBegin => _p.Surface;
            public override Color OverflowButtonGradientMiddle => _p.Surface;
            public override Color OverflowButtonGradientEnd => _p.Surface;
        }
    }
}
