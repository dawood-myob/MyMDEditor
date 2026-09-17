namespace MyMDEditor
{
    partial class MarkdownEditorForm
    {
        private System.ComponentModel.IContainer components = null;

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                (components as System.IDisposable)?.Dispose();
                _debouncer?.Dispose();
            }
            base.Dispose(disposing);
        }

        private System.Windows.Forms.MenuStrip menuStrip1;
        private System.Windows.Forms.ToolStripMenuItem fileToolStripMenuItem;
        private System.Windows.Forms.ToolStripMenuItem openToolStripMenuItem;
        private System.Windows.Forms.ToolStripMenuItem saveToolStripMenuItem;
        private System.Windows.Forms.ToolStripMenuItem saveAsToolStripMenuItem;
        private System.Windows.Forms.ToolStripSeparator toolStripSeparator1;
        private System.Windows.Forms.ToolStripMenuItem exitToolStripMenuItem;
        private System.Windows.Forms.ToolStripMenuItem editToolStripMenuItem;
        private System.Windows.Forms.ToolStripMenuItem undoToolStripMenuItem;
        private System.Windows.Forms.ToolStripMenuItem redoToolStripMenuItem;
        private System.Windows.Forms.ToolStripSeparator toolStripSeparator2;
        private System.Windows.Forms.ToolStripMenuItem cutToolStripMenuItem;
        private System.Windows.Forms.ToolStripMenuItem copyToolStripMenuItem;
        private System.Windows.Forms.ToolStripMenuItem pasteToolStripMenuItem;
        private System.Windows.Forms.ToolStripSeparator toolStripSeparator6;
        private System.Windows.Forms.ToolStripMenuItem selectAllToolStripMenuItem;
        private System.Windows.Forms.ToolStripMenuItem helpToolStripMenuItem;
        private System.Windows.Forms.ToolStripMenuItem aboutToolStripMenuItem;
        private System.Windows.Forms.SplitContainer splitContainer1;
        private System.Windows.Forms.RichTextBox richTextBoxEditor;
        private Microsoft.Web.WebView2.WinForms.WebView2 webView2Preview;
        private System.Windows.Forms.StatusStrip statusStrip1;
        private System.Windows.Forms.ToolStripStatusLabel toolStripStatusLabelStatus;
        private System.Windows.Forms.ToolStripStatusLabel toolStripStatusLabelBranding;
        private System.Windows.Forms.OpenFileDialog openFileDialog1;
        private System.Windows.Forms.SaveFileDialog saveFileDialog1;
        private System.Windows.Forms.ToolStrip toolStripFormatting;
        private System.Windows.Forms.ToolStripButton toolStripButtonBold;
        private System.Windows.Forms.ToolStripButton toolStripButtonItalic;
        private System.Windows.Forms.ToolStripButton toolStripButtonStrikethrough;
        private System.Windows.Forms.ToolStripSeparator toolStripSeparator3;
        private System.Windows.Forms.ToolStripDropDownButton toolStripDropDownButtonHeading;
        private System.Windows.Forms.ToolStripMenuItem heading1ToolStripMenuItem;
        private System.Windows.Forms.ToolStripMenuItem heading2ToolStripMenuItem;
        private System.Windows.Forms.ToolStripMenuItem heading3ToolStripMenuItem;
        private System.Windows.Forms.ToolStripSeparator toolStripSeparator4;
        private System.Windows.Forms.ToolStripButton toolStripButtonBulletList;
        private System.Windows.Forms.ToolStripButton toolStripButtonNumberedList;
        private System.Windows.Forms.ToolStripButton toolStripButtonQuote;
        private System.Windows.Forms.ToolStripSeparator toolStripSeparator5;
        private System.Windows.Forms.ToolStripButton toolStripButtonInlineCode;
        private System.Windows.Forms.ToolStripButton toolStripButtonCodeBlock;
        private System.Windows.Forms.ToolStripButton toolStripButtonLink;
        private System.Windows.Forms.ToolStripButton toolStripButtonHorizontalRule;
        private System.Windows.Forms.ToolStripButton toolStripButtonTable;

        // Theme palette (grey, VS Code-inspired).
        private static readonly System.Drawing.Color ThemeBackground = System.Drawing.Color.FromArgb(60, 60, 60);
        private static readonly System.Drawing.Color ThemeSurface = System.Drawing.Color.FromArgb(70, 70, 72);
        private static readonly System.Drawing.Color ThemeSurfaceAlt = System.Drawing.Color.FromArgb(80, 80, 83);
        private static readonly System.Drawing.Color ThemeAccent = System.Drawing.Color.FromArgb(0, 122, 204);
        private static readonly System.Drawing.Color ThemeText = System.Drawing.Color.FromArgb(230, 230, 230);
        private static readonly System.Drawing.Color ThemeEditorBackground = System.Drawing.Color.FromArgb(64, 64, 64);
        private static readonly System.Drawing.Color ThemeEditorText = System.Drawing.Color.FromArgb(225, 225, 225);

        private void InitializeComponent()
        {
            this.components = new System.ComponentModel.Container();
            this.menuStrip1 = new System.Windows.Forms.MenuStrip();
            this.fileToolStripMenuItem = new System.Windows.Forms.ToolStripMenuItem();
            this.openToolStripMenuItem = new System.Windows.Forms.ToolStripMenuItem();
            this.saveToolStripMenuItem = new System.Windows.Forms.ToolStripMenuItem();
            this.saveAsToolStripMenuItem = new System.Windows.Forms.ToolStripMenuItem();
            this.toolStripSeparator1 = new System.Windows.Forms.ToolStripSeparator();
            this.exitToolStripMenuItem = new System.Windows.Forms.ToolStripMenuItem();
            this.editToolStripMenuItem = new System.Windows.Forms.ToolStripMenuItem();
            this.undoToolStripMenuItem = new System.Windows.Forms.ToolStripMenuItem();
            this.redoToolStripMenuItem = new System.Windows.Forms.ToolStripMenuItem();
            this.toolStripSeparator2 = new System.Windows.Forms.ToolStripSeparator();
            this.cutToolStripMenuItem = new System.Windows.Forms.ToolStripMenuItem();
            this.copyToolStripMenuItem = new System.Windows.Forms.ToolStripMenuItem();
            this.pasteToolStripMenuItem = new System.Windows.Forms.ToolStripMenuItem();
            this.toolStripSeparator6 = new System.Windows.Forms.ToolStripSeparator();
            this.selectAllToolStripMenuItem = new System.Windows.Forms.ToolStripMenuItem();
            this.helpToolStripMenuItem = new System.Windows.Forms.ToolStripMenuItem();
            this.aboutToolStripMenuItem = new System.Windows.Forms.ToolStripMenuItem();
            this.splitContainer1 = new System.Windows.Forms.SplitContainer();
            this.richTextBoxEditor = new System.Windows.Forms.RichTextBox();
            this.webView2Preview = new Microsoft.Web.WebView2.WinForms.WebView2();
            this.statusStrip1 = new System.Windows.Forms.StatusStrip();
            this.toolStripStatusLabelStatus = new System.Windows.Forms.ToolStripStatusLabel();
            this.toolStripStatusLabelBranding = new System.Windows.Forms.ToolStripStatusLabel();
            this.openFileDialog1 = new System.Windows.Forms.OpenFileDialog();
            this.saveFileDialog1 = new System.Windows.Forms.SaveFileDialog();
            this.toolStripFormatting = new System.Windows.Forms.ToolStrip();
            this.toolStripButtonBold = new System.Windows.Forms.ToolStripButton();
            this.toolStripButtonItalic = new System.Windows.Forms.ToolStripButton();
            this.toolStripButtonStrikethrough = new System.Windows.Forms.ToolStripButton();
            this.toolStripSeparator3 = new System.Windows.Forms.ToolStripSeparator();
            this.toolStripDropDownButtonHeading = new System.Windows.Forms.ToolStripDropDownButton();
            this.heading1ToolStripMenuItem = new System.Windows.Forms.ToolStripMenuItem();
            this.heading2ToolStripMenuItem = new System.Windows.Forms.ToolStripMenuItem();
            this.heading3ToolStripMenuItem = new System.Windows.Forms.ToolStripMenuItem();
            this.toolStripSeparator4 = new System.Windows.Forms.ToolStripSeparator();
            this.toolStripButtonBulletList = new System.Windows.Forms.ToolStripButton();
            this.toolStripButtonNumberedList = new System.Windows.Forms.ToolStripButton();
            this.toolStripButtonQuote = new System.Windows.Forms.ToolStripButton();
            this.toolStripSeparator5 = new System.Windows.Forms.ToolStripSeparator();
            this.toolStripButtonInlineCode = new System.Windows.Forms.ToolStripButton();
            this.toolStripButtonCodeBlock = new System.Windows.Forms.ToolStripButton();
            this.toolStripButtonLink = new System.Windows.Forms.ToolStripButton();
            this.toolStripButtonHorizontalRule = new System.Windows.Forms.ToolStripButton();
            this.toolStripButtonTable = new System.Windows.Forms.ToolStripButton();
            this.menuStrip1.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)(this.splitContainer1)).BeginInit();
            this.splitContainer1.Panel1.SuspendLayout();
            this.splitContainer1.Panel2.SuspendLayout();
            this.splitContainer1.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)(this.webView2Preview)).BeginInit();
            this.statusStrip1.SuspendLayout();
            this.toolStripFormatting.SuspendLayout();
            this.SuspendLayout();
            //
            // menuStrip1
            //
            this.menuStrip1.BackColor = ThemeSurface;
            this.menuStrip1.ForeColor = ThemeText;
            this.menuStrip1.Renderer = new System.Windows.Forms.ToolStripProfessionalRenderer(new DarkColorTable());
            this.menuStrip1.Items.AddRange(new System.Windows.Forms.ToolStripItem[] {
            this.fileToolStripMenuItem,
            this.editToolStripMenuItem,
            this.helpToolStripMenuItem});
            this.menuStrip1.Location = new System.Drawing.Point(0, 0);
            this.menuStrip1.Name = "menuStrip1";
            this.menuStrip1.Size = new System.Drawing.Size(1100, 24);
            this.menuStrip1.TabIndex = 0;
            //
            // fileToolStripMenuItem
            //
            this.fileToolStripMenuItem.ForeColor = ThemeText;
            this.fileToolStripMenuItem.DropDownItems.AddRange(new System.Windows.Forms.ToolStripItem[] {
            this.openToolStripMenuItem,
            this.saveToolStripMenuItem,
            this.saveAsToolStripMenuItem,
            this.toolStripSeparator1,
            this.exitToolStripMenuItem});
            this.fileToolStripMenuItem.Name = "fileToolStripMenuItem";
            this.fileToolStripMenuItem.Text = "&File";
            //
            // openToolStripMenuItem
            //
            this.openToolStripMenuItem.Name = "openToolStripMenuItem";
            this.openToolStripMenuItem.ShortcutKeys = ((System.Windows.Forms.Keys)((System.Windows.Forms.Keys.Control | System.Windows.Forms.Keys.O)));
            this.openToolStripMenuItem.Text = "&Open...";
            this.openToolStripMenuItem.Click += new System.EventHandler(this.OpenToolStripMenuItem_Click);
            //
            // saveToolStripMenuItem
            //
            this.saveToolStripMenuItem.Name = "saveToolStripMenuItem";
            this.saveToolStripMenuItem.ShortcutKeys = ((System.Windows.Forms.Keys)((System.Windows.Forms.Keys.Control | System.Windows.Forms.Keys.S)));
            this.saveToolStripMenuItem.Text = "&Save";
            this.saveToolStripMenuItem.Click += new System.EventHandler(this.SaveToolStripMenuItem_Click);
            //
            // saveAsToolStripMenuItem
            //
            this.saveAsToolStripMenuItem.Name = "saveAsToolStripMenuItem";
            this.saveAsToolStripMenuItem.ShortcutKeys = ((System.Windows.Forms.Keys)(((System.Windows.Forms.Keys.Control | System.Windows.Forms.Keys.Shift) | System.Windows.Forms.Keys.S)));
            this.saveAsToolStripMenuItem.Text = "Save &As...";
            this.saveAsToolStripMenuItem.Click += new System.EventHandler(this.SaveAsToolStripMenuItem_Click);
            //
            // toolStripSeparator1
            //
            this.toolStripSeparator1.Name = "toolStripSeparator1";
            //
            // exitToolStripMenuItem
            //
            this.exitToolStripMenuItem.Name = "exitToolStripMenuItem";
            this.exitToolStripMenuItem.Text = "E&xit";
            this.exitToolStripMenuItem.Click += new System.EventHandler(this.ExitToolStripMenuItem_Click);
            //
            // editToolStripMenuItem
            //
            this.editToolStripMenuItem.ForeColor = ThemeText;
            this.editToolStripMenuItem.DropDownItems.AddRange(new System.Windows.Forms.ToolStripItem[] {
            this.undoToolStripMenuItem,
            this.redoToolStripMenuItem,
            this.toolStripSeparator2,
            this.cutToolStripMenuItem,
            this.copyToolStripMenuItem,
            this.pasteToolStripMenuItem,
            this.toolStripSeparator6,
            this.selectAllToolStripMenuItem});
            this.editToolStripMenuItem.Name = "editToolStripMenuItem";
            this.editToolStripMenuItem.Text = "&Edit";
            //
            // undoToolStripMenuItem
            //
            this.undoToolStripMenuItem.Name = "undoToolStripMenuItem";
            this.undoToolStripMenuItem.ShortcutKeys = ((System.Windows.Forms.Keys)((System.Windows.Forms.Keys.Control | System.Windows.Forms.Keys.Z)));
            this.undoToolStripMenuItem.Text = "&Undo";
            this.undoToolStripMenuItem.Click += new System.EventHandler(this.UndoToolStripMenuItem_Click);
            //
            // redoToolStripMenuItem
            //
            this.redoToolStripMenuItem.Name = "redoToolStripMenuItem";
            this.redoToolStripMenuItem.ShortcutKeys = ((System.Windows.Forms.Keys)((System.Windows.Forms.Keys.Control | System.Windows.Forms.Keys.Y)));
            this.redoToolStripMenuItem.Text = "&Redo";
            this.redoToolStripMenuItem.Click += new System.EventHandler(this.RedoToolStripMenuItem_Click);
            //
            // toolStripSeparator2
            //
            this.toolStripSeparator2.Name = "toolStripSeparator2";
            //
            // cutToolStripMenuItem
            //
            this.cutToolStripMenuItem.Name = "cutToolStripMenuItem";
            this.cutToolStripMenuItem.ShortcutKeys = ((System.Windows.Forms.Keys)((System.Windows.Forms.Keys.Control | System.Windows.Forms.Keys.X)));
            this.cutToolStripMenuItem.Text = "Cu&t";
            this.cutToolStripMenuItem.Click += new System.EventHandler(this.CutToolStripMenuItem_Click);
            //
            // copyToolStripMenuItem
            //
            this.copyToolStripMenuItem.Name = "copyToolStripMenuItem";
            this.copyToolStripMenuItem.ShortcutKeys = ((System.Windows.Forms.Keys)((System.Windows.Forms.Keys.Control | System.Windows.Forms.Keys.C)));
            this.copyToolStripMenuItem.Text = "&Copy";
            this.copyToolStripMenuItem.Click += new System.EventHandler(this.CopyToolStripMenuItem_Click);
            //
            // pasteToolStripMenuItem
            //
            this.pasteToolStripMenuItem.Name = "pasteToolStripMenuItem";
            this.pasteToolStripMenuItem.ShortcutKeys = ((System.Windows.Forms.Keys)((System.Windows.Forms.Keys.Control | System.Windows.Forms.Keys.V)));
            this.pasteToolStripMenuItem.Text = "&Paste";
            this.pasteToolStripMenuItem.Click += new System.EventHandler(this.PasteToolStripMenuItem_Click);
            //
            // toolStripSeparator6
            //
            this.toolStripSeparator6.Name = "toolStripSeparator6";
            //
            // selectAllToolStripMenuItem
            //
            this.selectAllToolStripMenuItem.Name = "selectAllToolStripMenuItem";
            this.selectAllToolStripMenuItem.ShortcutKeys = ((System.Windows.Forms.Keys)((System.Windows.Forms.Keys.Control | System.Windows.Forms.Keys.A)));
            this.selectAllToolStripMenuItem.Text = "Select &All";
            this.selectAllToolStripMenuItem.Click += new System.EventHandler(this.SelectAllToolStripMenuItem_Click);
            //
            // helpToolStripMenuItem
            //
            this.helpToolStripMenuItem.ForeColor = ThemeText;
            this.helpToolStripMenuItem.DropDownItems.AddRange(new System.Windows.Forms.ToolStripItem[] {
            this.aboutToolStripMenuItem});
            this.helpToolStripMenuItem.Name = "helpToolStripMenuItem";
            this.helpToolStripMenuItem.Text = "&Help";
            //
            // aboutToolStripMenuItem
            //
            this.aboutToolStripMenuItem.Name = "aboutToolStripMenuItem";
            this.aboutToolStripMenuItem.Text = "&About MyMDEditor";
            this.aboutToolStripMenuItem.Click += new System.EventHandler(this.AboutToolStripMenuItem_Click);
            //
            // toolStripFormatting
            //
            this.toolStripFormatting.BackColor = ThemeSurfaceAlt;
            this.toolStripFormatting.Renderer = new System.Windows.Forms.ToolStripProfessionalRenderer(new DarkColorTable());
            this.toolStripFormatting.Items.AddRange(new System.Windows.Forms.ToolStripItem[] {
            this.toolStripButtonBold,
            this.toolStripButtonItalic,
            this.toolStripButtonStrikethrough,
            this.toolStripSeparator3,
            this.toolStripDropDownButtonHeading,
            this.toolStripSeparator4,
            this.toolStripButtonBulletList,
            this.toolStripButtonNumberedList,
            this.toolStripButtonQuote,
            this.toolStripSeparator5,
            this.toolStripButtonInlineCode,
            this.toolStripButtonCodeBlock,
            this.toolStripButtonLink,
            this.toolStripButtonHorizontalRule,
            this.toolStripButtonTable});
            this.toolStripFormatting.Location = new System.Drawing.Point(0, 24);
            this.toolStripFormatting.Name = "toolStripFormatting";
            this.toolStripFormatting.Size = new System.Drawing.Size(1100, 27);
            this.toolStripFormatting.TabIndex = 3;
            //
            // toolStripButtonBold
            //
            this.toolStripButtonBold.DisplayStyle = System.Windows.Forms.ToolStripItemDisplayStyle.Text;
            this.toolStripButtonBold.ForeColor = ThemeText;
            this.toolStripButtonBold.Font = new System.Drawing.Font("Segoe UI", 9.5F, System.Drawing.FontStyle.Bold);
            this.toolStripButtonBold.Name = "toolStripButtonBold";
            this.toolStripButtonBold.Text = "B";
            this.toolStripButtonBold.ToolTipText = "Bold (Ctrl+B)";
            this.toolStripButtonBold.Click += new System.EventHandler(this.ToolStripButtonBold_Click);
            //
            // toolStripButtonItalic
            //
            this.toolStripButtonItalic.DisplayStyle = System.Windows.Forms.ToolStripItemDisplayStyle.Text;
            this.toolStripButtonItalic.ForeColor = ThemeText;
            this.toolStripButtonItalic.Font = new System.Drawing.Font("Segoe UI", 9.5F, System.Drawing.FontStyle.Italic);
            this.toolStripButtonItalic.Name = "toolStripButtonItalic";
            this.toolStripButtonItalic.Text = "I";
            this.toolStripButtonItalic.ToolTipText = "Italic (Ctrl+I)";
            this.toolStripButtonItalic.Click += new System.EventHandler(this.ToolStripButtonItalic_Click);
            //
            // toolStripButtonStrikethrough
            //
            this.toolStripButtonStrikethrough.DisplayStyle = System.Windows.Forms.ToolStripItemDisplayStyle.Text;
            this.toolStripButtonStrikethrough.ForeColor = ThemeText;
            this.toolStripButtonStrikethrough.Name = "toolStripButtonStrikethrough";
            this.toolStripButtonStrikethrough.Text = "S";
            this.toolStripButtonStrikethrough.ToolTipText = "Strikethrough";
            this.toolStripButtonStrikethrough.Click += new System.EventHandler(this.ToolStripButtonStrikethrough_Click);
            //
            // toolStripSeparator3
            //
            this.toolStripSeparator3.Name = "toolStripSeparator3";
            //
            // toolStripDropDownButtonHeading
            //
            this.toolStripDropDownButtonHeading.DisplayStyle = System.Windows.Forms.ToolStripItemDisplayStyle.Text;
            this.toolStripDropDownButtonHeading.ForeColor = ThemeText;
            this.toolStripDropDownButtonHeading.DropDownItems.AddRange(new System.Windows.Forms.ToolStripItem[] {
            this.heading1ToolStripMenuItem,
            this.heading2ToolStripMenuItem,
            this.heading3ToolStripMenuItem});
            this.toolStripDropDownButtonHeading.Name = "toolStripDropDownButtonHeading";
            this.toolStripDropDownButtonHeading.Text = "Heading";
            this.toolStripDropDownButtonHeading.ToolTipText = "Insert Heading";
            //
            // heading1ToolStripMenuItem
            //
            this.heading1ToolStripMenuItem.Name = "heading1ToolStripMenuItem";
            this.heading1ToolStripMenuItem.Text = "Heading 1";
            this.heading1ToolStripMenuItem.Click += new System.EventHandler(this.Heading1ToolStripMenuItem_Click);
            //
            // heading2ToolStripMenuItem
            //
            this.heading2ToolStripMenuItem.Name = "heading2ToolStripMenuItem";
            this.heading2ToolStripMenuItem.Text = "Heading 2";
            this.heading2ToolStripMenuItem.Click += new System.EventHandler(this.Heading2ToolStripMenuItem_Click);
            //
            // heading3ToolStripMenuItem
            //
            this.heading3ToolStripMenuItem.Name = "heading3ToolStripMenuItem";
            this.heading3ToolStripMenuItem.Text = "Heading 3";
            this.heading3ToolStripMenuItem.Click += new System.EventHandler(this.Heading3ToolStripMenuItem_Click);
            //
            // toolStripSeparator4
            //
            this.toolStripSeparator4.Name = "toolStripSeparator4";
            //
            // toolStripButtonBulletList
            //
            this.toolStripButtonBulletList.DisplayStyle = System.Windows.Forms.ToolStripItemDisplayStyle.Text;
            this.toolStripButtonBulletList.ForeColor = ThemeText;
            this.toolStripButtonBulletList.Name = "toolStripButtonBulletList";
            this.toolStripButtonBulletList.Text = "• List";
            this.toolStripButtonBulletList.ToolTipText = "Bulleted List";
            this.toolStripButtonBulletList.Click += new System.EventHandler(this.ToolStripButtonBulletList_Click);
            //
            // toolStripButtonNumberedList
            //
            this.toolStripButtonNumberedList.DisplayStyle = System.Windows.Forms.ToolStripItemDisplayStyle.Text;
            this.toolStripButtonNumberedList.ForeColor = ThemeText;
            this.toolStripButtonNumberedList.Name = "toolStripButtonNumberedList";
            this.toolStripButtonNumberedList.Text = "1. List";
            this.toolStripButtonNumberedList.ToolTipText = "Numbered List";
            this.toolStripButtonNumberedList.Click += new System.EventHandler(this.ToolStripButtonNumberedList_Click);
            //
            // toolStripButtonQuote
            //
            this.toolStripButtonQuote.DisplayStyle = System.Windows.Forms.ToolStripItemDisplayStyle.Text;
            this.toolStripButtonQuote.ForeColor = ThemeText;
            this.toolStripButtonQuote.Name = "toolStripButtonQuote";
            this.toolStripButtonQuote.Text = "\"  Quote";
            this.toolStripButtonQuote.ToolTipText = "Blockquote";
            this.toolStripButtonQuote.Click += new System.EventHandler(this.ToolStripButtonQuote_Click);
            //
            // toolStripSeparator5
            //
            this.toolStripSeparator5.Name = "toolStripSeparator5";
            //
            // toolStripButtonInlineCode
            //
            this.toolStripButtonInlineCode.DisplayStyle = System.Windows.Forms.ToolStripItemDisplayStyle.Text;
            this.toolStripButtonInlineCode.ForeColor = ThemeText;
            this.toolStripButtonInlineCode.Font = new System.Drawing.Font("Consolas", 9F);
            this.toolStripButtonInlineCode.Name = "toolStripButtonInlineCode";
            this.toolStripButtonInlineCode.Text = "Code";
            this.toolStripButtonInlineCode.ToolTipText = "Inline Code";
            this.toolStripButtonInlineCode.Click += new System.EventHandler(this.ToolStripButtonInlineCode_Click);
            //
            // toolStripButtonCodeBlock
            //
            this.toolStripButtonCodeBlock.DisplayStyle = System.Windows.Forms.ToolStripItemDisplayStyle.Text;
            this.toolStripButtonCodeBlock.ForeColor = ThemeText;
            this.toolStripButtonCodeBlock.Font = new System.Drawing.Font("Consolas", 9F);
            this.toolStripButtonCodeBlock.Name = "toolStripButtonCodeBlock";
            this.toolStripButtonCodeBlock.Text = "{ }";
            this.toolStripButtonCodeBlock.ToolTipText = "Code Block";
            this.toolStripButtonCodeBlock.Click += new System.EventHandler(this.ToolStripButtonCodeBlock_Click);
            //
            // toolStripButtonLink
            //
            this.toolStripButtonLink.DisplayStyle = System.Windows.Forms.ToolStripItemDisplayStyle.Text;
            this.toolStripButtonLink.ForeColor = ThemeText;
            this.toolStripButtonLink.Name = "toolStripButtonLink";
            this.toolStripButtonLink.Text = "Link";
            this.toolStripButtonLink.ToolTipText = "Insert Link (Ctrl+K)";
            this.toolStripButtonLink.Click += new System.EventHandler(this.ToolStripButtonLink_Click);
            //
            // toolStripButtonHorizontalRule
            //
            this.toolStripButtonHorizontalRule.DisplayStyle = System.Windows.Forms.ToolStripItemDisplayStyle.Text;
            this.toolStripButtonHorizontalRule.ForeColor = ThemeText;
            this.toolStripButtonHorizontalRule.Name = "toolStripButtonHorizontalRule";
            this.toolStripButtonHorizontalRule.Text = "HR";
            this.toolStripButtonHorizontalRule.ToolTipText = "Horizontal Rule";
            this.toolStripButtonHorizontalRule.Click += new System.EventHandler(this.ToolStripButtonHorizontalRule_Click);
            //
            // toolStripButtonTable
            //
            this.toolStripButtonTable.DisplayStyle = System.Windows.Forms.ToolStripItemDisplayStyle.Text;
            this.toolStripButtonTable.ForeColor = ThemeText;
            this.toolStripButtonTable.Name = "toolStripButtonTable";
            this.toolStripButtonTable.Text = "Table";
            this.toolStripButtonTable.ToolTipText = "Insert Table";
            this.toolStripButtonTable.Click += new System.EventHandler(this.ToolStripButtonTable_Click);
            //
            // splitContainer1
            //
            this.splitContainer1.BackColor = ThemeSurfaceAlt;
            this.splitContainer1.Dock = System.Windows.Forms.DockStyle.Fill;
            this.splitContainer1.Location = new System.Drawing.Point(0, 51);
            this.splitContainer1.Name = "splitContainer1";
            //
            // splitContainer1.Panel1
            //
            this.splitContainer1.Panel1.Controls.Add(this.richTextBoxEditor);
            this.splitContainer1.Panel1.BackColor = ThemeEditorBackground;
            //
            // splitContainer1.Panel2
            //
            this.splitContainer1.Panel2.Controls.Add(this.webView2Preview);
            this.splitContainer1.Panel2.BackColor = System.Drawing.Color.White;
            this.splitContainer1.Size = new System.Drawing.Size(1100, 626);
            this.splitContainer1.SplitterDistance = 540;
            this.splitContainer1.SplitterWidth = 6;
            this.splitContainer1.TabIndex = 1;
            //
            // richTextBoxEditor
            //
            this.richTextBoxEditor.AcceptsTab = true;
            this.richTextBoxEditor.BackColor = ThemeEditorBackground;
            this.richTextBoxEditor.BorderStyle = System.Windows.Forms.BorderStyle.None;
            this.richTextBoxEditor.Dock = System.Windows.Forms.DockStyle.Fill;
            this.richTextBoxEditor.Font = new System.Drawing.Font("Cascadia Code", 11F);
            this.richTextBoxEditor.ForeColor = ThemeEditorText;
            this.richTextBoxEditor.Location = new System.Drawing.Point(0, 0);
            this.richTextBoxEditor.Name = "richTextBoxEditor";
            this.richTextBoxEditor.Size = new System.Drawing.Size(540, 626);
            this.richTextBoxEditor.TabIndex = 0;
            this.richTextBoxEditor.Text = "";
            this.richTextBoxEditor.WordWrap = true;
            this.richTextBoxEditor.HideSelection = false;
            this.richTextBoxEditor.TextChanged += new System.EventHandler(this.RichTextBoxEditor_TextChanged);
            this.richTextBoxEditor.SelectionChanged += new System.EventHandler(this.RichTextBoxEditor_SelectionChanged);
            this.richTextBoxEditor.KeyDown += new System.Windows.Forms.KeyEventHandler(this.RichTextBoxEditor_KeyDown);
            //
            // webView2Preview
            //
            this.webView2Preview.CreationProperties = null;
            this.webView2Preview.DefaultBackgroundColor = System.Drawing.Color.White;
            this.webView2Preview.Dock = System.Windows.Forms.DockStyle.Fill;
            this.webView2Preview.Location = new System.Drawing.Point(0, 0);
            this.webView2Preview.Name = "webView2Preview";
            this.webView2Preview.Size = new System.Drawing.Size(554, 626);
            this.webView2Preview.TabIndex = 0;
            this.webView2Preview.ZoomFactor = 1D;
            //
            // statusStrip1
            //
            this.statusStrip1.BackColor = ThemeSurface;
            this.statusStrip1.SizingGrip = false;
            this.statusStrip1.Items.AddRange(new System.Windows.Forms.ToolStripItem[] {
            this.toolStripStatusLabelStatus,
            this.toolStripStatusLabelBranding});
            this.statusStrip1.Location = new System.Drawing.Point(0, 677);
            this.statusStrip1.Name = "statusStrip1";
            this.statusStrip1.Size = new System.Drawing.Size(1100, 24);
            this.statusStrip1.TabIndex = 2;
            //
            // toolStripStatusLabelStatus
            //
            this.toolStripStatusLabelStatus.ForeColor = ThemeText;
            this.toolStripStatusLabelStatus.Name = "toolStripStatusLabelStatus";
            this.toolStripStatusLabelStatus.Size = new System.Drawing.Size(39, 19);
            this.toolStripStatusLabelStatus.Text = "Ready";
            //
            // toolStripStatusLabelBranding
            //
            this.toolStripStatusLabelBranding.Alignment = System.Windows.Forms.ToolStripItemAlignment.Right;
            this.toolStripStatusLabelBranding.ForeColor = ThemeAccent;
            this.toolStripStatusLabelBranding.Name = "toolStripStatusLabelBranding";
            this.toolStripStatusLabelBranding.Size = new System.Drawing.Size(400, 19);
            this.toolStripStatusLabelBranding.Text = "Tool developed for personal use only \u2014 by Dawood Ali";
            //
            // openFileDialog1
            //
            this.openFileDialog1.Filter = "Markdown files (*.md)|*.md|All files (*.*)|*.*";
            this.openFileDialog1.Title = "Open Markdown File";
            //
            // saveFileDialog1
            //
            this.saveFileDialog1.Filter = "Markdown files (*.md)|*.md|All files (*.*)|*.*";
            this.saveFileDialog1.Title = "Save Markdown File";
            //
            // MarkdownEditorForm
            //
            this.AutoScaleDimensions = new System.Drawing.SizeF(10F, 25F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.BackColor = ThemeBackground;
            this.ClientSize = new System.Drawing.Size(1100, 701);
            this.Controls.Add(this.splitContainer1);
            this.Controls.Add(this.toolStripFormatting);
            this.Controls.Add(this.statusStrip1);
            this.Controls.Add(this.menuStrip1);
            this.MainMenuStrip = this.menuStrip1;
            this.MinimumSize = new System.Drawing.Size(800, 500);
            this.Name = "MarkdownEditorForm";
            this.Text = "MyMDEditor - Markdown Editor with Live Preview  |  by Dawood Ali";
            this.Load += new System.EventHandler(this.MarkdownEditorForm_Load);
            this.FormClosing += new System.Windows.Forms.FormClosingEventHandler(this.MarkdownEditorForm_FormClosing);
            this.menuStrip1.ResumeLayout(false);
            this.menuStrip1.PerformLayout();
            this.splitContainer1.Panel1.ResumeLayout(false);
            this.splitContainer1.Panel2.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)(this.splitContainer1)).EndInit();
            this.splitContainer1.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)(this.webView2Preview)).EndInit();
            this.statusStrip1.ResumeLayout(false);
            this.statusStrip1.PerformLayout();
            this.toolStripFormatting.ResumeLayout(false);
            this.toolStripFormatting.PerformLayout();
            this.ResumeLayout(false);
            this.PerformLayout();
        }

        /// <summary>
        /// Dark color table applied to menus/toolbars for a modern, cohesive theme.
        /// </summary>
        private sealed class DarkColorTable : System.Windows.Forms.ProfessionalColorTable
        {
            public override System.Drawing.Color MenuItemSelected => ThemeAccent;
            public override System.Drawing.Color MenuItemSelectedGradientBegin => ThemeAccent;
            public override System.Drawing.Color MenuItemSelectedGradientEnd => ThemeAccent;
            public override System.Drawing.Color MenuItemPressedGradientBegin => ThemeSurfaceAlt;
            public override System.Drawing.Color MenuItemPressedGradientEnd => ThemeSurfaceAlt;
            public override System.Drawing.Color MenuStripGradientBegin => ThemeSurface;
            public override System.Drawing.Color MenuStripGradientEnd => ThemeSurface;
            public override System.Drawing.Color ToolStripDropDownBackground => ThemeSurface;
            public override System.Drawing.Color ImageMarginGradientBegin => ThemeSurface;
            public override System.Drawing.Color ImageMarginGradientMiddle => ThemeSurface;
            public override System.Drawing.Color ImageMarginGradientEnd => ThemeSurface;
            public override System.Drawing.Color ToolStripGradientBegin => ThemeSurfaceAlt;
            public override System.Drawing.Color ToolStripGradientMiddle => ThemeSurfaceAlt;
            public override System.Drawing.Color ToolStripGradientEnd => ThemeSurfaceAlt;
            public override System.Drawing.Color ToolStripBorder => ThemeSurfaceAlt;
            public override System.Drawing.Color SeparatorDark => System.Drawing.Color.FromArgb(70, 70, 70);
            public override System.Drawing.Color SeparatorLight => System.Drawing.Color.FromArgb(70, 70, 70);
            public override System.Drawing.Color MenuBorder => ThemeSurfaceAlt;
            public override System.Drawing.Color MenuItemBorder => ThemeAccent;
        }
    }
}
