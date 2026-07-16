# capture-modals.ps1 - Capture modals, dropdowns, context menus
# Usage: powershell -ExecutionPolicy Bypass -File capture-modals.ps1

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;

public class YxeCap {
    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")]
    public static extern int GetWindowTextLength(IntPtr h);
    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")]
    public static extern bool GetClientRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")]
    public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr h, int cmd);
    [DllImport("user32.dll")]
    public static extern IntPtr SendMessage(IntPtr h, uint msg, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")]
    public static extern bool GetCursorPos(out POINT pt);
    [DllImport("user32.dll")]
    public static extern IntPtr WindowFromPoint(POINT pt);

    public delegate bool EnumWindowsProc(IntPtr h, IntPtr lParam);
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)]
    public struct POINT { public int X; public int Y; }

    public static IntPtr FindWindow() {
        IntPtr found = IntPtr.Zero;
        EnumWindows((h, lp) => {
            if (IsWindowVisible(h)) {
                int len = GetWindowTextLength(h);
                if (len > 0) {
                    StringBuilder sb = new StringBuilder(len + 1);
                    GetWindowText(h, sb, sb.Capacity);
                    string t = sb.ToString();
                    if (t.Contains("4.0")) {
                        found = h;
                        return false;
                    }
                }
            }
            return true;
        }, IntPtr.Zero);
        return found;
    }

    public static void Save(IntPtr h, string path) {
        RECT r;
        GetClientRect(h, out r);
        int w = r.Right, h2 = r.Bottom;
        if (w <= 0 || h2 <= 0) return;
        Bitmap bmp = new Bitmap(w, h2, PixelFormat.Format32bppArgb);
        using (Graphics g = Graphics.FromImage(bmp)) {
            IntPtr hdc = g.GetHdc();
            PrintWindow(h, hdc, 2);
            g.ReleaseHdc(hdc);
        }
        bmp.Save(path, ImageFormat.Png);
        bmp.Dispose();
    }

    public static void Click(IntPtr h, int x, int y) {
        SetForegroundWindow(h);
        System.Threading.Thread.Sleep(100);
        IntPtr lp = (IntPtr)((y << 16) | (x & 0xFFFF));
        SendMessage(h, 0x0201, IntPtr.Zero, lp);
        System.Threading.Thread.Sleep(50);
        SendMessage(h, 0x0202, IntPtr.Zero, lp);
    }

    public static void RightClick(IntPtr h, int x, int y) {
        SetForegroundWindow(h);
        System.Threading.Thread.Sleep(100);
        IntPtr lp = (IntPtr)((y << 16) | (x & 0xFFFF));
        SendMessage(h, 0x0204, IntPtr.Zero, lp);
        System.Threading.Thread.Sleep(50);
        SendMessage(h, 0x0205, IntPtr.Zero, lp);
    }

    public static void Maximize(IntPtr h) {
        ShowWindow(h, 3);
    }
}
"@ -ReferencedAssemblies System.Drawing

$hwnd = [YxeCap]::FindWindow()
if ($hwnd -eq [IntPtr]::Zero) {
    Write-Host "[ERROR] Window not found" -ForegroundColor Red
    exit 1
}
[YxeCap]::Maximize($hwnd)
Start-Sleep -Milliseconds 500

$baseDir = "D:\Data\projects\Multi-Publish\01-docs\yixiaoer-reverse\screenshots\modals"
if (-not (Test-Path $baseDir)) { New-Item -ItemType Directory -Path $baseDir -Force | Out-Null }

Write-Host "=== Capturing Modals & Interactions ===" -ForegroundColor Magenta

# 1. Go to Home first
[YxeCap]::Click($hwnd, 35, 80)
Start-Sleep -Milliseconds 800
[YxeCap]::Save($hwnd, "$baseDir\00-home-page.png")
Write-Host "[OK] home-page" -ForegroundColor Cyan

# 2. Click user avatar (top right)
[YxeCap]::Click($hwnd, 1250, 50)
Start-Sleep -Milliseconds 600
[YxeCap]::Save($hwnd, "$baseDir\01-user-dropdown.png")
Write-Host "[OK] user-dropdown" -ForegroundColor Cyan

# Close dropdown
[YxeCap]::Click($hwnd, 1250, 50)
Start-Sleep -Milliseconds 300

# 3. Click notification bell
[YxeCap]::Click($hwnd, 1180, 50)
Start-Sleep -Milliseconds 600
[YxeCap]::Save($hwnd, "$baseDir\02-notification-panel.png")
Write-Host "[OK] notification-panel" -ForegroundColor Cyan

# Close
[YxeCap]::Click($hwnd, 600, 300)
Start-Sleep -Milliseconds 300

# 4. Go to Publish and capture editor
[YxeCap]::Click($hwnd, 35, 135)
Start-Sleep -Milliseconds 1000
[YxeCap]::Save($hwnd, "$baseDir\03-publish-page.png")
Write-Host "[OK] publish-page" -ForegroundColor Cyan

# 5. Click platform dropdown
[YxeCap]::Click($hwnd, 500, 160)
Start-Sleep -Milliseconds 600
[YxeCap]::Save($hwnd, "$baseDir\04-platform-dropdown.png")
Write-Host "[OK] platform-dropdown" -ForegroundColor Cyan

# Close dropdown
[YxeCap]::Click($hwnd, 500, 160)
Start-Sleep -Milliseconds 300

# 6. Click post options (immediate/scheduled/draft)
[YxeCap]::Click($hwnd, 400, 220)
Start-Sleep -Milliseconds 600
[YxeCap]::Save($hwnd, "$baseDir\05-post-options.png")
Write-Host "[OK] post-options" -ForegroundColor Cyan

# Close
[YxeCap]::Click($hwnd, 400, 220)
Start-Sleep -Milliseconds 300

# 7. Go to Accounts and capture
[YxeCap]::Click($hwnd, 35, 190)
Start-Sleep -Milliseconds 1000
[YxeCap]::Save($hwnd, "$baseDir\06-accounts-page.png")
Write-Host "[OK] accounts-page" -ForegroundColor Cyan

# 8. Click "Add Account" button
[YxeCap]::Click($hwnd, 850, 120)
Start-Sleep -Milliseconds 800
[YxeCap]::Save($hwnd, "$baseDir\07-add-account-modal.png")
Write-Host "[OK] add-account-modal" -ForegroundColor Cyan

# 9. Close modal and go to Data
[YxeCap]::Click($hwnd, 850, 120)
Start-Sleep -Milliseconds 300

[YxeCap]::Click($hwnd, 35, 245)
Start-Sleep -Milliseconds 1000
[YxeCap]::Save($hwnd, "$baseDir\08-data-page.png")
Write-Host "[OK] data-page" -ForegroundColor Cyan

# 10. Click chart/graph area
[YxeCap]::Click($hwnd, 500, 300)
Start-Sleep -Milliseconds 600
[YxeCap]::Save($hwnd, "$baseDir\09-data-chart-detail.png")
Write-Host "[OK] data-chart-detail" -ForegroundColor Cyan

# 11. Go to Settings
[YxeCap]::Click($hwnd, 35, 630)
Start-Sleep -Milliseconds 1000
[YxeCap]::Save($hwnd, "$baseDir\10-settings-page.png")
Write-Host "[OK] settings-page" -ForegroundColor Cyan

# 12. Click proxy settings
[YxeCap]::Click($hwnd, 400, 180)
Start-Sleep -Milliseconds 600
[YxeCap]::Save($hwnd, "$baseDir\11-proxy-settings.png")
Write-Host "[OK] proxy-settings" -ForegroundColor Cyan

# 13. Click about/help
[YxeCap]::Click($hwnd, 400, 250)
Start-Sleep -Milliseconds 600
[YxeCap]::Save($hwnd, "$baseDir\12-about-panel.png")
Write-Host "[OK] about-panel" -ForegroundColor Cyan

# 14. Right-click on account list item (context menu)
[YxeCap]::Click($hwnd, 35, 190)
Start-Sleep -Milliseconds 1000
[YxeCap]::RightClick($hwnd, 500, 250)
Start-Sleep -Milliseconds 600
[YxeCap]::Save($hwnd, "$baseDir\13-account-context-menu.png")
Write-Host "[OK] account-context-menu" -ForegroundColor Cyan

# 15. Click elsewhere to close context menu
[YxeCap]::Click($hwnd, 200, 200)
Start-Sleep -Milliseconds 300

# 16. Go to Material library
[YxeCap]::Click($hwnd, 35, 575)
Start-Sleep -Milliseconds 1000
[YxeCap]::Save($hwnd, "$baseDir\14-material-page.png")
Write-Host "[OK] material-page" -ForegroundColor Cyan

# 17. Click upload button
[YxeCap]::Click($hwnd, 800, 100)
Start-Sleep -Milliseconds 600
[YxeCap]::Save($hwnd, "$baseDir\15-upload-modal.png")
Write-Host "[OK] upload-modal" -ForegroundColor Cyan

# 18. Go to Comments
[YxeCap]::Click($hwnd, 35, 355)
Start-Sleep -Milliseconds 1000
[YxeCap]::Save($hwnd, "$baseDir\16-comments-page.png")
Write-Host "[OK] comments-page" -ForegroundColor Cyan

# 19. Click auto-reply settings
[YxeCap]::Click($hwnd, 850, 100)
Start-Sleep -Milliseconds 600
[YxeCap]::Save($hwnd, "$baseDir\17-auto-reply-settings.png")
Write-Host "[OK] auto-reply-settings" -ForegroundColor Cyan

# 20. Go to Team
[YxeCap]::Click($hwnd, 35, 520)
Start-Sleep -Milliseconds 1000
[YxeCap]::Save($hwnd, "$baseDir\18-team-page.png")
Write-Host "[OK] team-page" -ForegroundColor Cyan

# 21. Go to Creation
[YxeCap]::Click($hwnd, 35, 410)
Start-Sleep -Milliseconds 1000
[YxeCap]::Save($hwnd, "$baseDir\19-creation-page.png")
Write-Host "[OK] creation-page" -ForegroundColor Cyan

# 22. Go to AI
[YxeCap]::Click($hwnd, 35, 465)
Start-Sleep -Milliseconds 1000
[YxeCap]::Save($hwnd, "$baseDir\20-ai-page.png")
Write-Host "[OK] ai-page" -ForegroundColor Cyan

Write-Host "`n=== MODAL CAPTURE COMPLETE ===" -ForegroundColor Magenta
Write-Host "Saved to: $baseDir" -ForegroundColor Cyan

# Count total screenshots
$total = (Get-ChildItem -Path "$baseDir" -File).Count
Write-Host "Total modal screenshots: $total" -ForegroundColor Green
