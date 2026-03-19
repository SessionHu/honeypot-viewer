import std.stdio : File, stderr, stdout;
import std.file : DirEntry, SpanMode, dirEntries, exists, mkdirRecurse, readLink, readText, write;
import std.path : baseName, buildPath;
import std.string : split, splitLines, startsWith, strip;
import std.algorithm : all, canFind, find;
import std.conv : to;
import std.json : JSONValue, parseJSON;
import std.array : appender, empty, front, replace;
import std.format : format;
import std.system : Endian, endian;
import std.net.curl : HTTP;
import std.parallelism : defaultPoolThreads, parallel;
import core.time : seconds;
import std.range : drop;
import std.ascii : isDigit;
import std.process : environment;
import core.sys.posix.unistd : sysconf, _SC_CLK_TCK;

// 确保小端序
static assert(endian == Endian.littleEndian, "Only support LE.");

long hz = 100L;

// 获取系统启动以来的秒数
long getSystemUptime() {
  import core.sys.posix.time : CLOCK_MONOTONIC, clock_gettime, timespec;
  timespec ts;
  // CLOCK_MONOTONIC 代表单调递增时间，即系统启动时间
  if (clock_gettime(CLOCK_MONOTONIC, &ts) == 0) {
    return ts.tv_sec; 
  }
  return 0;
}

// 存储连接信息的结构体
struct ConnectionInfo {
  string pid;
  string ip;
  ushort localPort;
  ushort remotePort;
  string rss;
  string cpuTime;
  string procTime;
  string args;
}

/**
 * 解析单个进程的连接信息
 * 逻辑：PID -> /proc/[pid]/fd -> socket inode -> /proc/net/tcp
 */
ConnectionInfo getProcessDetails(string pidPath) {
  ConnectionInfo info;
  auto pid = pidPath.baseName;
  info.pid = pid;

  try {
    // 获取进程参数和基础状态
    info.args = readText(pidPath ~ "/cmdline").replace("\0", " ").strip;
    
    auto status = readText(pidPath ~ "/status");
    auto rssLine = status.splitLines.find!(l => l.startsWith("VmRSS:"));
    info.rss = rssLine.empty ? "0" : rssLine.front.split[1];

    auto stat = readText(pidPath ~ "/stat").split;
    // utime(14) + stime(15) 换算成 CPU 时间
    info.cpuTime = (stat[13].to!long + stat[14].to!long).to!string;
    // 进程运行时间
    info.procTime = (getSystemUptime() - stat[21].to!long / hz).to!string();

    // 查找 socket inode
    string[] inodes;
    foreach (DirEntry entry; dirEntries(pidPath ~ "/fd", SpanMode.shallow)) {
      try {
        auto link = readLink(entry.name);
        if (link.startsWith("socket:[")) {
          inodes ~= link[8 .. $-1];
        }
      } catch (Exception e) {
        stderr.writeln(e);
      }
    }

    if (!inodes.empty) {
      auto f = File("/proc/net/tcp", "r");
      foreach (line; f.byLine.drop(1)) {
        auto parts = line.split;
        if (parts.length < 10 || !inodes.canFind(parts[9].idup)) continue;

        // 解析 IP: 0100007F -> 127.0.0.1 (针对小端序解析)
        auto remoteAddr = parts[2].split(':');
        if (remoteAddr[0].length == 8) { // 仅处理 IPv4
          uint rawIp = remoteAddr[0].to!uint(16);
          info.ip = format("%d.%d.%d.%d", 
            rawIp & 0xFF, (rawIp >> 8) & 0xFF, 
            (rawIp >> 16) & 0xFF, (rawIp >> 24) & 0xFF);
          
          info.localPort = parts[1].split(':')[1].to!ushort(16);
          info.remotePort = remoteAddr[1].to!ushort(16);
          break;
        }
      }
    }
  } catch (Exception e) {
    stderr.writeln(e);
  }
  return info;
}

string cachedir;

JSONValue queryInfoIP(string ip) {
  auto cachepath = buildPath(cachedir, ip);
  try {
    string content = readText(cachepath);
    if (content.length > 0) return parseJSON(content);
  } catch (Exception) {
    // do nothing
  }
  try {
    auto url = "https://api.live.bilibili.com/ip_service/v1/ip_service/get_ip_addr?ip=" ~ ip;
    auto client = HTTP(url);
    client.operationTimeout = 4.seconds;
    auto contentAppender = appender!(ubyte[])();
    client.onReceive = (ubyte[] data) {
      contentAppender.put(data);
      return data.length;
    };
    client.perform();
    string content = cast(string)contentAppender.data;
    if (content.length > 0) {
      try {
        write(cachepath, content);
      } catch (Exception) {
        // do nothing...
      }
      return parseJSON(content)["data"];
    }
  } catch (Exception e) {
    return JSONValue(["error": e.msg]);
  }
  return JSONValue(["error": "empty response from server"]);
}

void main() {
  hz = sysconf(_SC_CLK_TCK);
  cachedir = buildPath(environment.get("TMPDIR", "/tmp"), "honeypot-viewer");
  if (!exists(cachedir)) mkdirRecurse(cachedir);

  ConnectionInfo[] rawBots;

  // 第一阶段：同步遍历 /proc 获取本地进程快照
  try {
    foreach (DirEntry entry; dirEntries("/proc", SpanMode.shallow)) {
      if (!entry.isDir || !entry.name.baseName.all!isDigit) continue;
      
      auto cmdPath = entry.name ~ "/cmdline";
      if (exists(cmdPath) && readText(cmdPath).canFind("pv")) {
        auto detail = getProcessDetails(entry.name);
        if (detail.ip !is null) rawBots ~= detail;
      }
    }
  } catch (Exception e) {
    stderr.writeln(e);
  }

  // 第二阶段：并发请求 API 获取地理位置
  JSONValue[] jsonBots;
  jsonBots.length = rawBots.length;

  defaultPoolThreads(8);
  foreach (i, ref bot; parallel(rawBots)) {
    JSONValue j;
    j["pid"] = bot.pid;
    j["ip"] = bot.ip;
    j["lport"] = bot.localPort;
    j["rport"] = bot.remotePort;
    j["rss"] = bot.rss;
    j["cpu"] = bot.cpuTime;
    j["time"] = bot.procTime;
    j["args"] = bot.args;
    j["more"] = queryInfoIP(bot.ip);
    jsonBots[i] = j;
  }

  // 输出标准的 CGI JSON 响应
  stdout.write("Content-Type: application/json; charset=utf-8\r\n");
  //stdout.write("Access-Control-Allow-Origin: *\r\n"); 
  stdout.write("\r\n");
  stdout.write(JSONValue(jsonBots).toString());
}
