"""生成带讲解视频的配音片段：edge-tts 合成 → mp3 + durations.json"""
import asyncio, json, os, subprocess, sys
import edge_tts

VOICE = "zh-CN-YunxiNeural"
RATE = "+4%"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "narr")
os.makedirs(OUT, exist_ok=True)

SEGMENTS = [
    # id, 配音文案
    ("intro",
     "这是一个面向医院病案质量的 AI 平台，智医质控 MedAI。"
     "前端用 Vue3 加 TypeScript，后端是 Node.js 加 Express，数据库 MySQL 8，"
     "AI 部分接入了 DeepSeek 大模型。"),
    ("login",
     "先用管理员账号登录。演示账号可以一键填充，"
     "登录成功后服务端签发 JWT，之后每个接口都会校验身份和角色权限。"),
    ("dashboard",
     "进来是质控驾驶舱。上面六张卡片分别是患者总数、今日新增病历、"
     "近三十天平均质控分、通过率、待处理病历，以及 AI 辅助诊断次数。"),
    ("charts",
     "趋势图把病历数量和平均质控分放在一起看，能判断病案质量是在变好还是变差。"
     "右边是科室分布，下面环形图统计高频质控问题，"
     "比如主诉与现病史不一致，出现了多少次。"),
    ("records",
     "进入病历质控。列表支持按状态、科室和关键词筛选，"
     "评分用颜色分档，八十分以上绿色通过，八十分以下黄色、红色不通过。"),
    ("detail",
     "点开一份病历。左边是结构化的七个要素：主诉、现病史、既往史、"
     "体格检查、辅助检查、诊断和处理意见。"),
    ("qcrun",
     "这里一键运行 AI 质控。后端把这份病历拼成提示词发给 DeepSeek，"
     "强制模型只返回 JSON，拿回来再做字段兜底和数值钳制。"),
    ("report",
     "几秒钟出报告。总分、等级、四个维度的得分，以及逐条问题清单。"
     "每一条都写清楚缺了什么、扣多少分、应该怎么改。"),
    ("fallback",
     "如果没有配置 DeepSeek 的 Key，系统会自动降级到本地规则引擎。"
     "缺现病史扣三十五分，主诉和现病史不一致扣十二分，"
     "一旦出现严重问题，总分直接封顶七十二分。"),
    ("patients",
     "患者管理是院内主索引。点开档案，能看到这个人的全部就诊记录、过敏史和就诊时间线。"),
    ("diagnosis",
     "AI 辅助诊断。选一个典型的发热咳嗽病例，点生成诊断建议。"
     "输出是按可能性排序的鉴别诊断，带 ICD-10 编码、建议完善的检查，"
     "还有必须警惕的危险信号。"),
    ("assistant",
     "AI 医学助手支持多轮对话，每条消息都会落库，下次进来还能接着聊。"),
    ("rules",
     "质控规则一共十二条，分成完整性、准确性、逻辑性、规范性四类，"
     "扣分权重和启停都能按医院的管理要求调整。"),
    ("audit",
     "所有关键操作都会写审计日志，满足医疗信息系统的留痕要求。"
     "管理员还能在这里管理账号、角色和科室。"),
    ("outro",
     "整套代码就在本地项目目录里，包含建表脚本、演示数据、一键部署脚本。"
     "需要的话可以部署到云服务器，同事用浏览器打开地址就能直接用。"),
]


async def synth(text, path):
    communicate = edge_tts.Communicate(text, VOICE, rate=RATE)
    await communicate.save(path)


def duration_of(path, ffmpeg):
    out = subprocess.run([ffmpeg, "-hide_banner", "-i", path],
                         capture_output=True, text=True, encoding="utf-8", errors="ignore")
    for line in (out.stderr or "").splitlines():
        if "Duration:" in line:
            hms = line.split("Duration:")[1].split(",")[0].strip()
            h, m, s = hms.split(":")
            return round(int(h) * 3600 + int(m) * 60 + float(s), 2)
    return 0.0


async def main():
    ffmpeg = sys.argv[1]
    meta = []
    for i, (sid, text) in enumerate(SEGMENTS, start=1):
        path = os.path.join(OUT, f"seg-{i:02d}-{sid}.mp3")
        if not os.path.exists(path) or os.path.getsize(path) < 1000:
            await synth(text, path)
            print(f"  合成 {sid}")
        dur = duration_of(path, ffmpeg)
        meta.append({"id": sid, "index": i, "file": path, "text": text, "dur": dur})
        print(f"  {sid}: {dur}s")
    with open(os.path.join(OUT, "durations.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    print("总时长约", round(sum(m["dur"] for m in meta), 1), "秒")


asyncio.run(main())
