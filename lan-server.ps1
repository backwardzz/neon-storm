# NEON STORM — LAN-сервер: раздаёт игру по локальной сети и пересылает
# сообщения между хостом и игроками через WebSocket. Интернет не нужен.
param([int]$Port = 8777, [switch]$Local, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}

$src = @'
using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Threading;

public class NsClient {
    public int Id;
    public TcpClient T;
    public NetworkStream S;
    public readonly object L = new object();
    public bool IsHost;
    public bool Joined;
}

public static class NsServer {
    static string Root, RootSep;
    static int Port;
    static string IpsJson = "[]";
    static readonly object Lk = new object();
    static readonly Dictionary<int, NsClient> Clients = new Dictionary<int, NsClient>();
    static NsClient Host;
    static int NextId = 1;
    static TcpListener Listener;

    public static void Start(string root, int port, string ipsJson, bool loopbackOnly) {
        Root = Path.GetFullPath(root).TrimEnd('\\');
        RootSep = Root + "\\";
        Port = port;
        IpsJson = ipsJson;
        Listener = new TcpListener(loopbackOnly ? IPAddress.Loopback : IPAddress.Any, port);
        Listener.Start();
        Thread th = new Thread(AcceptLoop);
        th.IsBackground = true;
        th.Start();
    }

    public static void Log(string s) {
        Console.WriteLine("[" + DateTime.Now.ToString("HH:mm:ss") + "] " + s);
    }

    static void AcceptLoop() {
        while (true) {
            TcpClient c;
            try { c = Listener.AcceptTcpClient(); } catch { return; }
            Thread th = new Thread(Handle);
            th.IsBackground = true;
            th.Start(c);
        }
    }

    static byte[] ReadExact(Stream s, int n) {
        byte[] b = new byte[n];
        int o = 0;
        while (o < n) {
            int r = s.Read(b, o, n - o);
            if (r <= 0) throw new IOException("closed");
            o += r;
        }
        return b;
    }

    static string ReadHead(Stream s) {
        StringBuilder sb = new StringBuilder();
        int state = 0;
        while (sb.Length < 16384) {
            int b = s.ReadByte();
            if (b < 0) return null;
            sb.Append((char)b);
            if (b == '\r') state = (state == 2) ? 3 : 1;
            else if (b == '\n' && (state == 1 || state == 3)) { state++; if (state == 4) return sb.ToString(); }
            else state = 0;
        }
        return null;
    }

    static void Handle(object o) {
        TcpClient tc = (TcpClient)o;
        tc.NoDelay = true;
        tc.SendTimeout = 4000;
        try {
            NetworkStream s = tc.GetStream();
            string head = ReadHead(s);
            if (head == null) { tc.Close(); return; }
            string[] lines = head.Split(new string[] { "\r\n" }, StringSplitOptions.None);
            string[] req = lines[0].Split(' ');
            if (req.Length < 2) { tc.Close(); return; }
            string path = req[1];
            int q = path.IndexOf('?');
            if (q >= 0) path = path.Substring(0, q);
            string key = null;
            bool upgrade = false;
            foreach (string ln in lines) {
                int i = ln.IndexOf(':');
                if (i < 0) continue;
                string n = ln.Substring(0, i).Trim().ToLowerInvariant();
                string v = ln.Substring(i + 1).Trim();
                if (n == "sec-websocket-key") key = v;
                if (n == "upgrade" && v.ToLowerInvariant() == "websocket") upgrade = true;
            }
            if (path == "/ws" && upgrade && key != null) { WsSession(tc, s, key); return; }
            ServeFile(s, Uri.UnescapeDataString(path));
        } catch { }
        try { tc.Close(); } catch { }
    }

    static string Mime(string f) {
        switch (Path.GetExtension(f).ToLowerInvariant()) {
            case ".html": return "text/html; charset=utf-8";
            case ".js": return "application/javascript; charset=utf-8";
            case ".css": return "text/css; charset=utf-8";
            case ".json": return "application/json; charset=utf-8";
            case ".png": return "image/png";
            case ".svg": return "image/svg+xml";
            case ".ico": return "image/x-icon";
            case ".md": return "text/plain; charset=utf-8";
            default: return null;
        }
    }

    static void ServeFile(NetworkStream s, string path) {
        if (path == "/lan.json") {
            SendHttp(s, 200, "application/json", Encoding.UTF8.GetBytes("{\"lan\":true,\"port\":" + Port + ",\"ips\":" + IpsJson + "}"));
            return;
        }
        if (path == "/" || path == "") path = "/index.html";
        string rel = path.TrimStart('/').Replace('/', '\\');
        string full;
        try { full = Path.GetFullPath(Path.Combine(Root, rel)); } catch { full = ""; }
        string mime = Mime(full);
        if (!full.StartsWith(RootSep, StringComparison.OrdinalIgnoreCase) || mime == null || !File.Exists(full)) {
            SendHttp(s, 404, "text/plain", Encoding.UTF8.GetBytes("404"));
            return;
        }
        SendHttp(s, 200, mime, File.ReadAllBytes(full));
    }

    static void SendHttp(NetworkStream s, int code, string type, byte[] body) {
        string h = "HTTP/1.1 " + code + (code == 200 ? " OK" : " Not Found") +
            "\r\nContent-Type: " + type + "\r\nContent-Length: " + body.Length +
            "\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n";
        byte[] hb = Encoding.ASCII.GetBytes(h);
        s.Write(hb, 0, hb.Length);
        s.Write(body, 0, body.Length);
        s.Flush();
    }

    static byte[] BuildFrame(int op, byte[] p) {
        int hl = p.Length < 126 ? 2 : (p.Length <= 65535 ? 4 : 10);
        byte[] f = new byte[hl + p.Length];
        f[0] = (byte)(0x80 | op);
        if (p.Length < 126) f[1] = (byte)p.Length;
        else if (p.Length <= 65535) { f[1] = 126; f[2] = (byte)(p.Length >> 8); f[3] = (byte)p.Length; }
        else { f[1] = 127; long len = p.Length; for (int i = 0; i < 8; i++) f[9 - i] = (byte)(len >> (8 * i)); }
        Buffer.BlockCopy(p, 0, f, hl, p.Length);
        return f;
    }

    static void SendRaw(NsClient c, byte[] frame) {
        try { lock (c.L) { c.S.Write(frame, 0, frame.Length); } }
        catch { try { c.T.Close(); } catch { } }
    }

    static void SendText(NsClient c, string s) { SendRaw(c, BuildFrame(1, Encoding.UTF8.GetBytes(s))); }

    static void WsSession(TcpClient tc, NetworkStream s, string key) {
        string acc;
        using (SHA1 sha = SHA1.Create())
            acc = Convert.ToBase64String(sha.ComputeHash(Encoding.ASCII.GetBytes(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")));
        byte[] hb = Encoding.ASCII.GetBytes("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + acc + "\r\n\r\n");
        s.Write(hb, 0, hb.Length);
        NsClient c = new NsClient();
        c.T = tc;
        c.S = s;
        lock (Lk) { c.Id = NextId++; Clients[c.Id] = c; }
        try {
            MemoryStream buf = new MemoryStream();
            while (true) {
                int b0 = s.ReadByte(); if (b0 < 0) break;
                int b1 = s.ReadByte(); if (b1 < 0) break;
                bool fin = (b0 & 0x80) != 0;
                int op = b0 & 0x0F;
                bool masked = (b1 & 0x80) != 0;
                long len = b1 & 0x7F;
                if (len == 126) { byte[] e = ReadExact(s, 2); len = (e[0] << 8) | e[1]; }
                else if (len == 127) { byte[] e = ReadExact(s, 8); len = 0; for (int i = 0; i < 8; i++) len = (len << 8) | e[i]; }
                if (len > 16 * 1024 * 1024) break;
                byte[] mask = masked ? ReadExact(s, 4) : null;
                byte[] data = ReadExact(s, (int)len);
                if (masked) for (int i = 0; i < data.Length; i++) data[i] ^= mask[i & 3];
                if (op == 8) break;
                if (op == 9) { SendRaw(c, BuildFrame(10, data)); continue; }
                if (op == 10) continue;
                buf.Write(data, 0, data.Length);
                if (!fin) continue;
                string msg = Encoding.UTF8.GetString(buf.ToArray());
                buf.SetLength(0);
                OnMessage(c, msg);
            }
        } catch { }
        Disconnect(c);
    }

    // Протокол:
    //  клиент -> сервер: "host" | "join" | "T<id|*>|<json>" (хост -> игроку/всем) | "K<id>" (хост кикает) | "D<json>" (игрок -> хосту)
    //  сервер -> клиент: "hosted" | "hostbusy" | "joined" | "nohost" | "O<id>" | "C<id>" | "D<id>|<json>" | "M<json>" | "X"
    static void OnMessage(NsClient c, string m) {
        if (m == "host") {
            bool ok;
            lock (Lk) { ok = Host == null || Host == c; if (ok) { Host = c; c.IsHost = true; } }
            SendText(c, ok ? "hosted" : "hostbusy");
            if (ok) Log("Host created the room");
            return;
        }
        if (m == "join") {
            NsClient h;
            lock (Lk) { h = Host; if (h != null && h != c) c.Joined = true; }
            if (h == null || h == c) { SendText(c, "nohost"); return; }
            SendText(c, "joined");
            SendText(h, "O" + c.Id);
            Log("Player #" + c.Id + " joined");
            return;
        }
        if (m.Length == 0) return;
        if (c.IsHost) {
            if (m[0] == 'T') {
                int bar = m.IndexOf('|');
                if (bar < 0) return;
                string target = m.Substring(1, bar - 1);
                List<NsClient> list = new List<NsClient>();
                lock (Lk) {
                    if (target == "*") { foreach (NsClient x in Clients.Values) if (x.Joined) list.Add(x); }
                    else {
                        int id; NsClient x;
                        if (int.TryParse(target, out id) && Clients.TryGetValue(id, out x) && x.Joined) list.Add(x);
                    }
                }
                if (list.Count == 0) return;
                byte[] frame = BuildFrame(1, Encoding.UTF8.GetBytes("M" + m.Substring(bar + 1)));
                foreach (NsClient x in list) SendRaw(x, frame);
            } else if (m[0] == 'K') {
                int id; NsClient x = null;
                if (int.TryParse(m.Substring(1), out id)) lock (Lk) Clients.TryGetValue(id, out x);
                if (x != null) try { x.T.Close(); } catch { }
            }
            return;
        }
        if (c.Joined && m[0] == 'D') {
            NsClient h;
            lock (Lk) h = Host;
            if (h != null) SendText(h, "D" + c.Id + "|" + m.Substring(1));
        }
    }

    static void Disconnect(NsClient c) {
        NsClient h = null;
        List<NsClient> others = new List<NsClient>();
        bool wasHost = false, wasJoined = c.Joined;
        lock (Lk) {
            if (!Clients.Remove(c.Id)) return;
            if (Host == c) {
                Host = null; wasHost = true;
                foreach (NsClient x in Clients.Values) if (x.Joined) { others.Add(x); x.Joined = false; }
            } else h = Host;
        }
        try { c.T.Close(); } catch { }
        if (wasHost) { Log("Host left - room closed"); foreach (NsClient x in others) SendText(x, "X"); }
        else if (wasJoined && h != null) { SendText(h, "C" + c.Id); Log("Player #" + c.Id + " left"); }
    }
}
'@

Add-Type -TypeDefinition $src -Language CSharp

# адреса этого ПК в локальной сети
$ips = @()
try {
  $ips = @(Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } |
    ForEach-Object { $_.IPv4Address.IPAddress })
} catch {}
if (-not $ips.Count) {
  try {
    $ips = @(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
      ForEach-Object { $_.IPAddress })
  } catch {}
}
$ips = @($ips | Where-Object { $_ } | Select-Object -Unique)
# домашние сети (192.168.*, 10.*, 172.16-31.*) — первыми, VPN-адаптеры — после
$ips = @($ips | Sort-Object { if ($_ -match '^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)') { 0 } else { 1 } })
$json = '[' + (($ips | ForEach-Object { '"' + $_ + '"' }) -join ',') + ']'

try {
  [NsServer]::Start($PSScriptRoot, $Port, $json, [bool]$Local)
} catch {
  Write-Host ''
  Write-Host "Не удалось запустить сервер на порту $Port. Возможно, он уже запущен в другом окне." -ForegroundColor Red
  Write-Host $_.Exception.Message
  exit 1
}

Write-Host ''
Write-Host '  NEON STORM — LAN-сервер запущен' -ForegroundColor Cyan
Write-Host '  ================================' -ForegroundColor Cyan
Write-Host ''
Write-Host "  На ЭТОМ ноутбуке:   http://localhost:$Port" -ForegroundColor White
if ($ips.Count) {
  foreach ($ip in $ips) { Write-Host "  На ДРУГИХ ноутбуках: http://${ip}:$Port" -ForegroundColor Green }
} else {
  Write-Host '  Не нашёл адрес в локальной сети — проверь, что Wi-Fi подключён.' -ForegroundColor Yellow
}
Write-Host ''
Write-Host '  В игре: «Онлайн / Wi-Fi» → блок «По одному Wi-Fi» → Создать / Войти.'
Write-Host '  Если Windows спросит про доступ к сети — нажми «Разрешить».' -ForegroundColor Yellow
Write-Host '  Не закрывай это окно, пока играете. Остановить — Ctrl+C.'
Write-Host ''

if (-not $NoBrowser) { Start-Process "http://localhost:$Port/" }
while ($true) { Start-Sleep -Seconds 1 }
