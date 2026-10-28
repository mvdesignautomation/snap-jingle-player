package main

import (
	"embed"
	"fmt"
	"io"
	"io/fs"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"unsafe"

	"github.com/jchv/go-webview2"
	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

const (
	appName    = "Snap Jingle Player"
	appID      = "SnapJinglePlayer"
	appVersion = "1.0.0"
	publisher  = "Snap Jingle Player"
)

//go:embed all:ui
var uiFS embed.FS

func main() {
	if hasArg("--uninstall") {
		uninstall()
		return
	}
	if hasArg("--app") || runningFromInstallDir() {
		runApp()
		return
	}
	install()
}

func hasArg(name string) bool {
	for _, arg := range os.Args[1:] {
		if strings.EqualFold(arg, name) {
			return true
		}
	}
	return false
}

func localAppData() string {
	if v := os.Getenv("LOCALAPPDATA"); v != "" {
		return v
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, "AppData", "Local")
}

func installDir() string {
	return filepath.Join(localAppData(), "Programs", appID)
}

func userDataDir() string {
	return filepath.Join(localAppData(), appID, "UserData")
}

func installedExe() string {
	return filepath.Join(installDir(), "SnapJinglePlayer.exe")
}

func currentExe() string {
	exe, err := os.Executable()
	if err != nil {
		return os.Args[0]
	}
	resolved, err := filepath.EvalSymlinks(exe)
	if err != nil {
		return exe
	}
	return resolved
}

func runningFromInstallDir() bool {
	dir, err := filepath.Abs(filepath.Dir(currentExe()))
	if err != nil {
		return false
	}
	want, err := filepath.Abs(installDir())
	if err != nil {
		return false
	}
	return strings.EqualFold(dir, want)
}

func install() {
	dir := installDir()
	already := fileExists(installedExe())
	msg := "This will install Snap Jingle Player for the current Windows user.\n\nInstall folder:\n" + dir + "\n\nNo administrator rights are required."
	if already {
		msg = "Snap Jingle Player is already installed.\n\nClick OK to repair / reinstall, or Cancel to quit.\n\n" + dir
	}
	if messageBox(msg, appName+" Setup", mbOKCancel|mbIconInfo) != idOK {
		return
	}

	if err := os.MkdirAll(dir, 0o755); err != nil {
		fatal("Could not create the install folder:\n" + err.Error())
		return
	}
	if err := copyFile(currentExe(), installedExe()); err != nil {
		fatal("Could not copy the application:\n" + err.Error())
		return
	}

	startMenu := filepath.Join(os.Getenv("APPDATA"), "Microsoft", "Windows", "Start Menu", "Programs", appName+".lnk")
	if err := createShortcut(startMenu, installedExe(), dir, appName); err != nil {
		// Non-fatal; registry uninstall still works.
		_ = err
	}

	desktop := false
	if messageBox("Create a desktop shortcut?", appName+" Setup", mbYesNo|mbIconQuestion) == idYes {
		desktop = true
		desk := filepath.Join(desktopDir(), appName+".lnk")
		_ = createShortcut(desk, installedExe(), dir, appName)
	}

	writeUninstallKey(desktop)
	writeInstallReadme(dir)

	if messageBox("Installation complete.\n\nLaunch Snap Jingle Player now?", appName+" Setup", mbYesNo|mbIconInfo) == idYes {
		cmd := exec.Command(installedExe(), "--app")
		cmd.Dir = dir
		_ = cmd.Start()
	}
}

func uninstall() {
	if messageBox("Uninstall Snap Jingle Player?\n\nYour soundboard configuration is stored separately and can be kept.", appName, mbYesNo|mbIconQuestion) != idYes {
		return
	}

	keepData := true
	if messageBox("Also delete saved pads, sounds, and settings?", appName, mbYesNo|mbIconQuestion) == idYes {
		keepData = false
	}

	_ = os.Remove(filepath.Join(os.Getenv("APPDATA"), "Microsoft", "Windows", "Start Menu", "Programs", appName+".lnk"))
	_ = os.Remove(filepath.Join(desktopDir(), appName+".lnk"))
	deleteUninstallKey()

	if !keepData {
		_ = os.RemoveAll(filepath.Join(localAppData(), appID))
	}

	dir := installDir()
	quoted := `"` + dir + `"`
	cmd := exec.Command("cmd.exe", "/C", "ping 127.0.0.1 -n 3 > nul & rmdir /S /Q "+quoted)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	_ = cmd.Start()
	messageBox("Snap Jingle Player was uninstalled.", appName, mbOK|mbIconInfo)
}

func runApp() {
	if !singleInstance() {
		messageBox("Snap Jingle Player is already running.", appName, mbOK|mbIconInfo)
		return
	}

	sub, err := fs.Sub(uiFS, "ui")
	if err != nil {
		fatal("The application UI is missing from this installer.")
		return
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		fatal("Could not start the local player:\n" + err.Error())
		return
	}
	defer listener.Close()

	mux := http.NewServeMux()
	mux.Handle("/", http.FileServer(http.FS(sub)))
	server := &http.Server{Handler: mux}
	go func() { _ = server.Serve(listener) }()

	url := "http://" + listener.Addr().String() + "/"
	dataPath := userDataDir()
	_ = os.MkdirAll(dataPath, 0o755)

	w := webview2.NewWithOptions(webview2.WebViewOptions{
		Debug:     false,
		AutoFocus: true,
		DataPath:  dataPath,
		WindowOptions: webview2.WindowOptions{
			Title:  appName,
			Width:  1440,
			Height: 900,
			Center: true,
		},
	})
	if w == nil {
		_ = exec.Command("cmd.exe", "/C", "start", "", url).Start()
		messageBox("Opened Snap Jingle Player in your default browser.\n\nKeep this dialog open while you play sounds. Click OK to quit.", appName, mbOK|mbIconInfo)
		return
	}
	defer w.Destroy()
	w.Navigate(url)
	w.Run()
}

func singleInstance() bool {
	name, err := windows.UTF16PtrFromString("Local\\" + appID)
	if err != nil {
		return true
	}
	_, err = windows.CreateMutex(nil, false, name)
	if err == windows.ERROR_ALREADY_EXISTS {
		return false
	}
	return true
}

func writeUninstallKey(desktop bool) {
	key, _, err := registry.CreateKey(
		registry.CURRENT_USER,
		`Software\Microsoft\Windows\CurrentVersion\Uninstall\`+appID,
		registry.ALL_ACCESS,
	)
	if err != nil {
		return
	}
	defer key.Close()
	_ = key.SetStringValue("DisplayName", appName)
	_ = key.SetStringValue("DisplayVersion", appVersion)
	_ = key.SetStringValue("Publisher", publisher)
	_ = key.SetStringValue("InstallLocation", installDir())
	_ = key.SetStringValue("DisplayIcon", installedExe())
	_ = key.SetStringValue("UninstallString", `"`+installedExe()+`" --uninstall`)
	_ = key.SetStringValue("QuietUninstallString", `"`+installedExe()+`" --uninstall`)
	_ = key.SetDWordValue("NoModify", 1)
	_ = key.SetDWordValue("NoRepair", 1)
	if info, err := os.Stat(installedExe()); err == nil {
		_ = key.SetDWordValue("EstimatedSize", uint32(info.Size()/1024))
	}
	if desktop {
		_ = key.SetStringValue("DesktopShortcut", "1")
	}
}

func deleteUninstallKey() {
	_ = registry.DeleteKey(registry.CURRENT_USER, `Software\Microsoft\Windows\CurrentVersion\Uninstall\`+appID)
}

func writeInstallReadme(dir string) {
	text := appName + ` ` + appVersion + `

A local jingle / soundboard player.

Assign audio files to pads, trigger them with the mouse or keyboard,
and use STOP ALL (Esc) during live use.

Sounds are stored inside the app so the board still works if you later
move the original files. Use Settings → Export board to make a backup.

Uninstall from Windows Settings → Apps, or run this program with --uninstall.
`
	_ = os.WriteFile(filepath.Join(dir, "README.txt"), []byte(text), 0o644)
}

func createShortcut(link, target, workdir, desc string) error {
	if err := os.MkdirAll(filepath.Dir(link), 0o755); err != nil {
		return err
	}
	script := fmt.Sprintf(
		`$s=(New-Object -ComObject WScript.Shell).CreateShortcut(%s);$s.TargetPath=%s;$s.WorkingDirectory=%s;$s.WindowStyle=1;$s.Description=%s;$s.Save()`,
		psQuote(link), psQuote(target), psQuote(workdir), psQuote(desc),
	)
	cmd := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	return cmd.Run()
}

func psQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "''") + "'"
}

func desktopDir() string {
	if v := os.Getenv("USERPROFILE"); v != "" {
		return filepath.Join(v, "Desktop")
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, "Desktop")
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	tmp := dst + ".tmp"
	out, err := os.OpenFile(tmp, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o755)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		_ = os.Remove(tmp)
		return err
	}
	if err := out.Close(); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	_ = os.Remove(dst)
	return os.Rename(tmp, dst)
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func fatal(text string) {
	messageBox(text, appName, mbOK|mbIconError)
}

const (
	mbOK          = 0x00000000
	mbOKCancel    = 0x00000001
	mbYesNo       = 0x00000004
	mbIconError   = 0x00000010
	mbIconQuestion = 0x00000020
	mbIconInfo    = 0x00000040
	idOK          = 1
	idYes         = 6
)

func messageBox(text, caption string, flags uint) int {
	t, _ := windows.UTF16PtrFromString(text)
	c, _ := windows.UTF16PtrFromString(caption)
	user32 := windows.NewLazySystemDLL("user32.dll")
	proc := user32.NewProc("MessageBoxW")
	r, _, _ := proc.Call(0, uintptr(unsafe.Pointer(t)), uintptr(unsafe.Pointer(c)), uintptr(flags))
	return int(r)
}
