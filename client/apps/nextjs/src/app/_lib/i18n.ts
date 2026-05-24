export const supportedLocales = [
  { code: "en", label: "English" },
  { code: "ko", label: "한국어" },
  { code: "ja", label: "日本語" },
  { code: "zh", label: "中文" },
  { code: "es", label: "Español" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
  { code: "id", label: "Bahasa Indonesia" },
  { code: "it", label: "Italiano" },
  { code: "pt", label: "Português" },
  { code: "vi", label: "Tiếng Việt" },
  { code: "ar", label: "العربية" },
] as const;

export type SupportedLocale = (typeof supportedLocales)[number]["code"];

export const defaultLocale: SupportedLocale = "en";

export function isSupportedLocale(locale: string): locale is SupportedLocale {
  return supportedLocales.some((item) => item.code === locale);
}

export function getLocalizedPath(locale: SupportedLocale, path: string) {
  if (locale === defaultLocale) {
    return path;
  }

  if (path === "/") {
    return `/${locale}`;
  }

  return `/${locale}${path}`;
}

interface TextBlock {
  title: string;
  body: string;
}

interface PlatformGroup {
  name: string;
  builds: string[];
}

export interface MarketingCopy {
  nav: {
    features: string;
    download: string;
    github: string;
  };
  footer: {
    description: string;
  };
  home: {
    hero: {
      badge: string;
      title: string;
      bodyStrong: string;
      body: string;
      secondary: string;
      cta: string;
      platforms: string[];
      demoLabel: string;
    };
    stats: TextBlock[];
    features: {
      badge: string;
      title: string;
      body: string;
      items: TextBlock[];
    };
    workflow: {
      badge: string;
      title: string;
      body: string;
      libraryTitle: string;
      libraryBody: string;
      libraryLabel: string;
      noteTitle: string;
      noteBody: string;
      noteLabel: string;
    };
  };
  download: {
    hero: {
      badge: string;
      title: string;
      body: string;
      availabilitySuffix: string;
      platforms: string[];
    };
    platformGroups: PlatformGroup[];
    releaseDescription: string;
    comingSoon: string;
    openSource: {
      title: string;
      body: string;
      cardTitle: string;
      cardBodyStart: string;
      cardBodyEnd: string;
      cta: string;
    };
    requirements: {
      title: string;
      body: string;
      items: string[];
    };
  };
}

const englishCopy: MarketingCopy = {
  nav: {
    features: "Features",
    download: "Download",
    github: "GitHub",
  },
  footer: {
    description:
      "A local-first workspace that turns long videos and audio into clear, shareable briefs—summaries, answers, and notes you can actually use.",
  },
  home: {
    hero: {
      badge: "Local-first briefing workspace",
      title: "Turn long videos into briefs you can act on.",
      bodyStrong: "OpenBrief",
      body:
        "turns long videos, audio, and recordings into clear briefs—without the busywork. Import a source, get a transcript, ask questions that stay grounded in what was said, and export only the notes you need.",
      secondary:
        "Perfect for research calls, lectures, product demos, interviews, and screen recordings you need to remember long after they end.",
      cta: "Download OpenBrief",
      platforms: ["Mac", "Windows", "Linux"],
      demoLabel: "OpenBrief product demo",
    },
    stats: [
      {
        title: "Free",
        body: "The desktop app is free—no paid plan, no trial clock.",
      },
      {
        title: "No sign-up",
        body: "Open the app and start summarizing. No account needed.",
      },
      {
        title: "Yours, on your device",
        body: "Your files and everything OpenBrief generates stay on your machine.",
      },
    ],
    features: {
      badge: "Features",
      title: "The real work starts when playback ends.",
      body:
        "Source, transcript, summary, chat, and export all live together—so a quick recap never turns into a mess of tabs and scattered notes.",
      items: [
        {
          title: "Every source in one place",
          body:
            "Open recordings, demos, lectures, and web videos from a single view.",
        },
        {
          title: "Captions first",
          body:
            "OpenBrief uses existing captions when they're there, and only transcribes when it has to.",
        },
        {
          title: "Answers you can trust",
          body:
            "Ask a question and get an answer tied straight back to the transcript—no guessing.",
        },
        {
          title: "Export to Markdown",
          body:
            "Send summaries, decisions, timestamps, and notes to a clean file you can take anywhere.",
        },
        {
          title: "Private by default",
          body:
            "Your files and generated notes never leave your device.",
        },
        {
          title: "No account required",
          body:
            "Download the app and start summarizing—no sign-up, no login.",
        },
      ],
    },
    workflow: {
      badge: "How it works",
      title: "From source to summary, without losing the thread.",
      body:
        "Start in your library, then open a source the moment you're ready to transcribe, summarize, and chat with it.",
      libraryTitle: "Library",
      libraryBody:
        "Add a local file or a supported web link, keep every source detail attached, and line up a clean queue before you dig in.",
      libraryLabel: "OpenBrief library view",
      noteTitle: "Note page",
      noteBody:
        "Open a source to generate a transcript, write a focused summary, and ask grounded questions—all without leaving the player.",
      noteLabel: "OpenBrief note page",
    },
  },
  download: {
    hero: {
      badge: "Desktop builds & open source",
      title: "Download OpenBrief for desktop",
      body:
        "Install the app, bring your own provider keys, and keep every transcript, summary, and exported note under your control.",
      availabilitySuffix: "available",
      platforms: ["Mac", "Windows", "Linux"],
    },
    platformGroups: [
      {
        name: "macOS",
        builds: ["Apple Silicon", "Intel"],
      },
      {
        name: "Windows",
        builds: ["x64 installer", "ARM64 installer"],
      },
      {
        name: "Linux",
        builds: ["x64 AppImage", "Debian package"],
      },
    ],
    releaseDescription:
      "Signed builds will land here as soon as packaging is wired up.",
    comingSoon: "Coming soon",
    openSource: {
      title: "Open source, if you want it",
      body:
        "OpenBrief is built in the open. Read the code, follow packaging progress, or build it yourself whenever you want to see exactly what ships.",
      cardTitle: "GitHub repository",
      cardBodyStart: "The code lives at",
      cardBodyEnd:
        "—browse it, follow along, or build from source while we wire up public downloads.",
      cta: "View on GitHub",
    },
    requirements: {
      title: "Requirements",
      body:
        "OpenBrief runs media processing locally, with optional cloud AI providers you choose yourself.",
      items: [
        "macOS 13, Windows 11, or a current Linux desktop",
        "Local disk space for imported media and generated transcripts",
        "An optional API key for OpenAI, Anthropic, Gemini, or OpenRouter",
        "Optional bundled tools for YouTube and offline transcription",
      ],
    },
  },
};

const chineseCopy: MarketingCopy = {
  nav: {
    features: "功能",
    download: "下载",
    github: "GitHub",
  },
  footer: {
    description:
      "本地优先的工作空间，把冗长的视频和音频变成清晰、好分享的简报——摘要、回答和能直接用的笔记，一处搞定。",
  },
  home: {
    hero: {
      badge: "在本地运行的简报工作空间",
      title: "把长视频变成能直接用的简报。",
      bodyStrong: "OpenBrief",
      body:
        "帮你把冗长的视频、音频和录屏整理成干净利落的简报，省去繁琐步骤。导入来源、生成文字稿、获得有出处的回答，再把需要的笔记导出来。",
      secondary:
        "适合研究通话、课程、产品演示、采访和录屏——那些结束后还得记很久的内容。",
      cta: "下载 OpenBrief",
      platforms: ["Mac", "Windows", "Linux"],
      demoLabel: "OpenBrief 产品演示视频",
    },
    stats: [
      {
        title: "免费",
        body: "桌面应用免费使用，没有付费套餐，也没有试用倒计时。",
      },
      {
        title: "无需注册",
        body: "打开应用就能开始总结，不用创建账号。",
      },
      {
        title: "数据留在本地",
        body: "你的文件和 OpenBrief 生成的内容，都留在你自己的电脑上。",
      },
    ],
    features: {
      badge: "功能",
      title: "播放结束，才是重点开始。",
      body:
        "来源、文字稿、摘要、对话和导出都集中在一起，简单回顾不会变成一堆散落的标签页和零碎笔记。",
      items: [
        {
          title: "所有来源，一处打开",
          body: "在同一个界面里打开录音、演示、课程和网络视频。",
        },
        {
          title: "字幕优先",
          body: "有字幕就直接用，只在没有时才转写。",
        },
        {
          title: "靠得住的回答",
          body: "提问后得到的回答都直接对应文字稿，不靠猜。",
        },
        {
          title: "导出为 Markdown",
          body: "把摘要、决定、时间戳和笔记导出成一份干净的文件，随处可用。",
        },
        {
          title: "默认私密",
          body: "你的文件和生成的笔记都不会离开你的设备。",
        },
        {
          title: "无需账号",
          body: "下载应用就能开始总结，不用注册，也不用登录。",
        },
      ],
    },
    workflow: {
      badge: "使用方式",
      title: "从来源到摘要，思路不中断。",
      body:
        "先在资料库里整理，准备好后打开来源，当场转写、总结、对话。",
      libraryTitle: "资料库",
      libraryBody:
        "添加本地文件或支持的网页链接，保留每条来源的信息，开工前先把队列理得清清楚楚。",
      libraryLabel: "OpenBrief 资料库界面",
      noteTitle: "笔记页",
      noteBody:
        "打开来源，就能生成文字稿、写出聚焦的摘要，还能提出有出处的问题——全程不用离开播放器。",
      noteLabel: "OpenBrief 笔记页",
    },
  },
  download: {
    hero: {
      badge: "桌面版 · 开源",
      title: "下载桌面版 OpenBrief",
      body:
        "安装应用，接入你自己的服务商密钥，文字稿、摘要和导出的笔记都牢牢握在自己手里。",
      availabilitySuffix: "可用",
      platforms: ["Mac", "Windows", "Linux"],
    },
    platformGroups: [
      {
        name: "macOS",
        builds: ["Apple Silicon", "Intel"],
      },
      {
        name: "Windows",
        builds: ["x64 安装程序", "ARM64 安装程序"],
      },
      {
        name: "Linux",
        builds: ["x64 AppImage", "Debian 软件包"],
      },
    ],
    releaseDescription: "打包流程接通后，签名版本就会出现在这里。",
    comingSoon: "即将推出",
    openSource: {
      title: "想要的话，也可以开源",
      body:
        "OpenBrief 在公开开发。你可以阅读代码、关注打包进度，想亲眼确认发布内容时，也能自己从源码构建。",
      cardTitle: "GitHub 仓库",
      cardBodyStart: "代码就在",
      cardBodyEnd: "上。在我们打通公开下载之前，欢迎来看看、关注，或自己从源码构建。",
      cta: "在 GitHub 查看",
    },
    requirements: {
      title: "系统要求",
      body:
        "OpenBrief 在本地处理媒体，云端 AI 服务商则由你按需自行选择接入。",
      items: [
        "macOS 13、Windows 11，或较新的 Linux 桌面系统",
        "用于存放导入媒体和生成文字稿的本地磁盘空间",
        "OpenAI、Anthropic、Gemini 或 OpenRouter 的 API 密钥（可选）",
        "用于 YouTube 和离线转写的内置工具（可选）",
      ],
    },
  },
};

const koreanCopy: MarketingCopy = {
  nav: {
    features: "기능",
    download: "다운로드",
    github: "GitHub",
  },
  footer: {
    description:
      "긴 영상과 음성을 명확하고 공유하기 좋은 브리핑으로 바꿔 주는 로컬 우선 워크스페이스예요. 요약, 답변, 바로 쓰는 노트까지 한 번에.",
  },
  home: {
    hero: {
      badge: "로컬에서 도는 브리핑 워크스페이스",
      title: "긴 영상을 바로 쓰는 브리핑으로.",
      bodyStrong: "OpenBrief",
      body:
        "하나로 긴 영상과 음성, 녹화를 군더더기 없이 깔끔한 브리핑으로 정리해요. 소스를 불러오고, 스크립트를 만들고, 실제 발언에 근거한 답을 받고, 필요한 노트만 골라 내보내세요.",
      secondary:
        "리서치 콜, 강의, 제품 데모, 인터뷰, 화면 녹화처럼 끝나고 나서도 오래 기억해야 하는 자료에 딱이에요.",
      cta: "OpenBrief 다운로드",
      platforms: ["Mac", "Windows", "Linux"],
      demoLabel: "OpenBrief 제품 데모 영상",
    },
    stats: [
      {
        title: "무료",
        body: "데스크톱 앱은 무료예요. 유료 플랜도, 체험 기간도 없어요.",
      },
      {
        title: "가입 없이 바로",
        body: "앱을 열고 바로 요약하세요. 계정은 필요 없어요.",
      },
      {
        title: "데이터는 내 기기에",
        body: "내 파일도, OpenBrief가 만든 결과물도 모두 내 컴퓨터에 남아요.",
      },
    ],
    features: {
      badge: "기능",
      title: "재생이 끝난 다음이 진짜예요.",
      body:
        "소스, 스크립트, 요약, 채팅, 내보내기가 한곳에 모여 있어요. 잠깐 정리하려다 탭과 메모가 사방에 흩어지는 일이 없어요.",
      items: [
        {
          title: "모든 소스를 한 화면에",
          body:
            "녹음, 데모, 강의, 웹 영상을 한 화면에서 열어요.",
        },
        {
          title: "자막부터 먼저",
          body: "자막이 있으면 그대로 쓰고, 없을 때만 받아써요.",
        },
        {
          title: "믿을 수 있는 답변",
          body: "질문하면 스크립트에 바로 연결된 답을 줘요. 지어내지 않아요.",
        },
        {
          title: "Markdown으로 내보내기",
          body: "요약, 결정 사항, 타임스탬프, 노트를 어디든 가져갈 수 있는 깔끔한 파일로 내보내요.",
        },
        {
          title: "기본은 비공개",
          body: "내 파일과 생성된 노트는 기기 밖으로 나가지 않아요.",
        },
        {
          title: "계정 없이 시작",
          body: "앱을 받아서 바로 요약하세요. 가입도, 로그인도 없어요.",
        },
      ],
    },
    workflow: {
      badge: "사용 방법",
      title: "소스에서 요약까지, 흐름이 끊기지 않아요.",
      body:
        "라이브러리에서 시작하고, 준비되면 소스를 열어 바로 스크립트를 만들고 요약하고 대화하세요.",
      libraryTitle: "라이브러리",
      libraryBody:
        "로컬 파일이나 지원하는 웹 링크를 추가하고, 소스 정보를 그대로 붙여 둔 채로 작업 전에 깔끔하게 줄 세워 두세요.",
      libraryLabel: "OpenBrief 라이브러리 화면",
      noteTitle: "노트 페이지",
      noteBody:
        "소스를 열면 스크립트를 만들고, 핵심만 추린 요약을 쓰고, 근거 있는 질문까지 해요. 플레이어를 벗어날 필요가 없어요.",
      noteLabel: "OpenBrief 노트 페이지",
    },
  },
  download: {
    hero: {
      badge: "데스크톱 빌드 · 오픈 소스",
      title: "데스크톱용 OpenBrief 다운로드",
      body:
        "앱을 설치하고, 직접 발급한 제공자 키를 연결하면 스크립트와 요약, 내보낸 노트까지 모두 내 손안에 있어요.",
      availabilitySuffix: "지원",
      platforms: ["Mac", "Windows", "Linux"],
    },
    platformGroups: [
      { name: "macOS", builds: ["Apple Silicon", "Intel"] },
      { name: "Windows", builds: ["x64 설치 프로그램", "ARM64 설치 프로그램"] },
      { name: "Linux", builds: ["x64 AppImage", "Debian 패키지"] },
    ],
    releaseDescription:
      "패키징이 연결되는 대로 서명된 빌드가 여기에 올라와요.",
    comingSoon: "곧 제공",
    openSource: {
      title: "원한다면, 오픈 소스로",
      body:
        "OpenBrief는 공개적으로 만들고 있어요. 코드를 직접 보고, 패키징 진행 상황을 따라가고, 무엇이 배포되는지 확인하고 싶을 때 직접 빌드해 보세요.",
      cardTitle: "GitHub 저장소",
      cardBodyStart: "코드는",
      cardBodyEnd: "에 있어요. 공개 다운로드를 준비하는 동안 살펴보고, 따라오고, 직접 빌드해 보세요.",
      cta: "GitHub에서 보기",
    },
    requirements: {
      title: "요구 사항",
      body:
        "OpenBrief는 미디어 처리를 기기 안에서 직접 하고, 클라우드 AI 제공자는 원할 때 직접 골라 연결해요.",
      items: [
        "macOS 13, Windows 11, 또는 최신 Linux 데스크톱",
        "가져온 미디어와 생성된 스크립트를 둘 로컬 디스크 공간",
        "OpenAI, Anthropic, Gemini, OpenRouter용 API 키(선택)",
        "YouTube와 오프라인 받아쓰기를 위한 번들 도구(선택)",
      ],
    },
  },
};

const japaneseCopy: MarketingCopy = {
  nav: {
    features: "機能",
    download: "ダウンロード",
    github: "GitHub",
  },
  footer: {
    description:
      "長い動画や音声を、わかりやすくて共有しやすいブリーフに変えるローカルファーストのワークスペース。要約も、回答も、すぐ使えるノートも、これひとつで。",
  },
  home: {
    hero: {
      badge: "ローカルで動くブリーフィング・ワークスペース",
      title: "長い動画を、すぐ使えるブリーフに。",
      bodyStrong: "OpenBrief",
      body:
        "は、長い動画や音声、録画を、無駄なくすっきりしたブリーフにまとめます。ソースを取り込み、文字起こしを作り、実際に話された内容に基づいた回答をもらい、必要なノートだけを書き出せます。",
      secondary:
        "リサーチ通話、講義、製品デモ、インタビュー、画面録画など、終わったあとも長く覚えておきたい場面にぴったりです。",
      cta: "OpenBrief をダウンロード",
      platforms: ["Mac", "Windows", "Linux"],
      demoLabel: "OpenBrief 製品デモ動画",
    },
    stats: [
      { title: "無料", body: "デスクトップアプリは無料。有料プランも試用期限もありません。" },
      { title: "登録なしで", body: "アプリを開いてすぐに要約。アカウントは不要です。" },
      { title: "データは手元に", body: "あなたのファイルも、OpenBrief が作った成果物も、すべて自分のマシンに残ります。" },
    ],
    features: {
      badge: "機能",
      title: "本番は、再生が終わったあとです。",
      body:
        "ソース、文字起こし、要約、チャット、書き出しがひとつにまとまります。ちょっと振り返るだけのはずが、タブとメモで散らかることはありません。",
      items: [
        {
          title: "すべてのソースをひとつに",
          body: "録音、デモ、講義、Web動画を、ひとつの画面から開けます。",
        },
        {
          title: "まずは字幕から",
          body: "字幕があればそのまま使い、ないときだけ文字起こしします。",
        },
        {
          title: "信頼できる回答",
          body: "質問すると、文字起こしに直接ひもづいた回答が返ります。推測はしません。",
        },
        {
          title: "Markdown に書き出し",
          body: "要約、決定事項、タイムスタンプ、ノートを、どこへでも持ち出せるきれいなファイルに。",
        },
        {
          title: "既定でプライベート",
          body: "あなたのファイルも生成したノートも、デバイスの外には出ません。",
        },
        {
          title: "アカウント不要",
          body: "アプリをダウンロードしてすぐに要約。登録もログインもいりません。",
        },
      ],
    },
    workflow: {
      badge: "使い方",
      title: "ソースから要約まで、流れを途切れさせません。",
      body:
        "ライブラリから始めて、準備ができたらソースを開き、その場で文字起こし・要約・チャットができます。",
      libraryTitle: "ライブラリ",
      libraryBody:
        "ローカルファイルや対応するWebリンクを追加し、ソース情報をひもづけたまま、取りかかる前にきれいに並べておけます。",
      libraryLabel: "OpenBrief ライブラリ画面",
      noteTitle: "ノートページ",
      noteBody:
        "ソースを開けば、文字起こしを作り、要点を絞った要約を書き、根拠のある質問までできます。プレイヤーから離れる必要はありません。",
      noteLabel: "OpenBrief ノートページ",
    },
  },
  download: {
    hero: {
      badge: "デスクトップ版・オープンソース",
      title: "デスクトップ版 OpenBrief をダウンロード",
      body:
        "アプリをインストールし、自分で用意したプロバイダーキーをつなげば、文字起こしも要約も書き出したノートも、すべて自分の管理下に。",
      availabilitySuffix: "対応",
      platforms: ["Mac", "Windows", "Linux"],
    },
    platformGroups: [
      { name: "macOS", builds: ["Apple Silicon", "Intel"] },
      { name: "Windows", builds: ["x64 インストーラー", "ARM64 インストーラー"] },
      { name: "Linux", builds: ["x64 AppImage", "Debian パッケージ"] },
    ],
    releaseDescription:
      "パッケージングがつながり次第、署名済みビルドがここに並びます。",
    comingSoon: "近日公開",
    openSource: {
      title: "オープンソースという選択肢も",
      body:
        "OpenBrief は公開の場で開発しています。コードを読み、パッケージングの進み具合を追い、何が配布されるのか自分の目で確かめたいときはソースからビルドできます。",
      cardTitle: "GitHub リポジトリ",
      cardBodyStart: "コードは",
      cardBodyEnd: "にあります。公開ダウンロードを準備する間、のぞいて、追いかけて、自分でビルドしてみてください。",
      cta: "GitHub で見る",
    },
    requirements: {
      title: "動作環境",
      body:
        "OpenBrief はメディア処理を手元で行い、クラウドAIプロバイダーは必要に応じて自分で選んでつなげます。",
      items: [
        "macOS 13、Windows 11、または最新の Linux デスクトップ",
        "取り込んだメディアと生成した文字起こしを置くローカルディスク容量",
        "OpenAI、Anthropic、Gemini、OpenRouter の API キー（任意）",
        "YouTube とオフライン文字起こし用の同梱ツール（任意）",
      ],
    },
  },
};

const spanishCopy: MarketingCopy = {
  nav: {
    features: "Funciones",
    download: "Descargar",
    github: "GitHub",
  },
  footer: {
    description:
      "Un espacio de trabajo local que convierte vídeos y audio largos en resúmenes claros y fáciles de compartir: resúmenes, respuestas y notas listas para usar.",
  },
  home: {
    hero: {
      badge: "Espacio de briefings que funciona en local",
      title: "Convierte vídeos largos en resúmenes que puedes usar.",
      bodyStrong: "OpenBrief",
      body:
        "convierte vídeos, audio y grabaciones largos en resúmenes claros, sin trabajo de más. Importa una fuente, obtén una transcripción, haz preguntas con respuestas ancladas a lo que se dijo y exporta solo las notas que necesitas.",
      secondary:
        "Ideal para llamadas de investigación, clases, demos de producto, entrevistas y grabaciones de pantalla que necesitas recordar mucho después de que terminen.",
      cta: "Descargar OpenBrief",
      platforms: ["Mac", "Windows", "Linux"],
      demoLabel: "Vídeo de demostración de OpenBrief",
    },
    stats: [
      { title: "Gratis", body: "La app de escritorio es gratis: sin plan de pago ni prueba con cuenta atrás." },
      { title: "Sin registro", body: "Abre la app y empieza a resumir. No hace falta cuenta." },
      { title: "Tus datos, en tu equipo", body: "Tus archivos y todo lo que genera OpenBrief se quedan en tu máquina." },
    ],
    features: {
      badge: "Funciones",
      title: "Lo importante empieza cuando termina el vídeo.",
      body:
        "Fuente, transcripción, resumen, chat y exportación viven juntos, así que repasar algo nunca acaba en un caos de pestañas y notas sueltas.",
      items: [
        {
          title: "Todas tus fuentes en un sitio",
          body: "Abre grabaciones, demos, clases y vídeos web desde una sola vista.",
        },
        {
          title: "Primero los subtítulos",
          body: "OpenBrief usa los subtítulos que ya existen y solo transcribe cuando hace falta.",
        },
        {
          title: "Respuestas en las que confiar",
          body: "Pregunta y recibe respuestas ancladas directamente a la transcripción, sin inventar.",
        },
        {
          title: "Exporta a Markdown",
          body: "Lleva resúmenes, decisiones, marcas de tiempo y notas a un archivo limpio que va contigo a cualquier parte.",
        },
        {
          title: "Privado por defecto",
          body: "Tus archivos y las notas generadas nunca salen de tu dispositivo.",
        },
        {
          title: "Sin cuenta",
          body: "Descarga la app y empieza a resumir: sin registro ni inicio de sesión.",
        },
      ],
    },
    workflow: {
      badge: "Cómo funciona",
      title: "De la fuente al resumen sin perder el hilo.",
      body:
        "Empieza en tu biblioteca y abre una fuente justo cuando quieras transcribir, resumir y chatear con ella.",
      libraryTitle: "Biblioteca",
      libraryBody:
        "Añade un archivo local o un enlace web compatible, conserva cada detalle de la fuente y prepara una cola ordenada antes de ponerte a ello.",
      libraryLabel: "Vista de biblioteca de OpenBrief",
      noteTitle: "Página de notas",
      noteBody:
        "Abre una fuente para generar una transcripción, escribir un resumen al grano y hacer preguntas fundamentadas, todo sin salir del reproductor.",
      noteLabel: "Página de notas de OpenBrief",
    },
  },
  download: {
    hero: {
      badge: "Versiones de escritorio y código abierto",
      title: "Descarga OpenBrief para escritorio",
      body:
        "Instala la app, usa tus propias claves de proveedor y mantén cada transcripción, resumen y nota exportada bajo tu control.",
      availabilitySuffix: "disponible",
      platforms: ["Mac", "Windows", "Linux"],
    },
    platformGroups: [
      { name: "macOS", builds: ["Apple Silicon", "Intel"] },
      { name: "Windows", builds: ["Instalador x64", "Instalador ARM64"] },
      { name: "Linux", builds: ["AppImage x64", "Paquete Debian"] },
    ],
    releaseDescription:
      "Las versiones firmadas aparecerán aquí en cuanto el empaquetado esté listo.",
    comingSoon: "Próximamente",
    openSource: {
      title: "Código abierto, si lo quieres",
      body:
        "OpenBrief se desarrolla a la vista de todos. Lee el código, sigue el avance del empaquetado o compila tú mismo cuando quieras ver exactamente qué se publica.",
      cardTitle: "Repositorio de GitHub",
      cardBodyStart: "El código está en",
      cardBodyEnd: "y puedes verlo, seguirlo o compilarlo tú mismo mientras preparamos las descargas públicas.",
      cta: "Ver en GitHub",
    },
    requirements: {
      title: "Requisitos",
      body:
        "OpenBrief procesa los medios en local y los proveedores de IA en la nube los eliges tú, si los quieres.",
      items: [
        "macOS 13, Windows 11 o un escritorio Linux actual",
        "Espacio en disco local para los medios importados y las transcripciones generadas",
        "Una clave API opcional de OpenAI, Anthropic, Gemini u OpenRouter",
        "Herramientas integradas opcionales para YouTube y transcripción sin conexión",
      ],
    },
  },
};

const germanCopy: MarketingCopy = {
  nav: {
    features: "Funktionen",
    download: "Download",
    github: "GitHub",
  },
  footer: {
    description:
      "Ein lokal laufender Workspace, der lange Videos und Audio in klare, teilbare Briefings verwandelt – Zusammenfassungen, Antworten und Notizen, die du direkt nutzen kannst.",
  },
  home: {
    hero: {
      badge: "Briefing-Workspace, der lokal läuft",
      title: "Mach aus langen Videos Briefings, mit denen du arbeiten kannst.",
      bodyStrong: "OpenBrief",
      body:
        "verwandelt lange Videos, Audio und Aufnahmen in klare Briefings – ganz ohne Drumherum. Quelle importieren, Transkript erhalten, Fragen stellen, deren Antworten am Gesagten verankert bleiben, und nur die Notizen exportieren, die du brauchst.",
      secondary:
        "Ideal für Research-Calls, Vorlesungen, Produktdemos, Interviews und Bildschirmaufnahmen, an die du dich noch lange danach erinnern musst.",
      cta: "OpenBrief herunterladen",
      platforms: ["Mac", "Windows", "Linux"],
      demoLabel: "OpenBrief Produktdemo-Video",
    },
    stats: [
      { title: "Kostenlos", body: "Die Desktop-App ist kostenlos – kein Bezahlplan, kein Testzeit-Countdown." },
      { title: "Ohne Anmeldung", body: "App öffnen und loslegen. Kein Konto nötig." },
      { title: "Deine Daten, dein Gerät", body: "Deine Dateien und alles, was OpenBrief erzeugt, bleiben auf deinem Rechner." },
    ],
    features: {
      badge: "Funktionen",
      title: "Spannend wird's, wenn das Video zu Ende ist.",
      body:
        "Quelle, Transkript, Zusammenfassung, Chat und Export liegen zusammen – kurz nachschauen wird nie zum Chaos aus Tabs und losen Notizen.",
      items: [
        {
          title: "Alle Quellen an einem Ort",
          body: "Öffne Aufnahmen, Demos, Vorlesungen und Webvideos in einer einzigen Ansicht.",
        },
        {
          title: "Untertitel zuerst",
          body: "OpenBrief nutzt vorhandene Untertitel und transkribiert nur, wenn es sein muss.",
        },
        {
          title: "Antworten, auf die du dich verlässt",
          body: "Stell Fragen und bekomm Antworten, die direkt am Transkript hängen – ohne Raten.",
        },
        {
          title: "Export als Markdown",
          body: "Bring Zusammenfassungen, Entscheidungen, Zeitstempel und Notizen in eine saubere Datei, die du überallhin mitnimmst.",
        },
        {
          title: "Standardmäßig privat",
          body: "Deine Dateien und erzeugten Notizen verlassen dein Gerät nie.",
        },
        {
          title: "Kein Konto nötig",
          body: "App herunterladen und loslegen – ohne Anmeldung, ohne Login.",
        },
      ],
    },
    workflow: {
      badge: "So funktioniert's",
      title: "Von der Quelle zur Zusammenfassung, ohne den Faden zu verlieren.",
      body:
        "Starte in deiner Bibliothek und öffne eine Quelle genau dann, wenn du transkribieren, zusammenfassen und mit ihr chatten willst.",
      libraryTitle: "Bibliothek",
      libraryBody:
        "Füge eine lokale Datei oder einen unterstützten Weblink hinzu, behalte jedes Quelldetail bei und stell dir eine saubere Warteschlange zusammen, bevor du loslegst.",
      libraryLabel: "OpenBrief Bibliotheksansicht",
      noteTitle: "Notizseite",
      noteBody:
        "Öffne eine Quelle, um ein Transkript zu erzeugen, eine fokussierte Zusammenfassung zu schreiben und fundierte Fragen zu stellen – ohne den Player zu verlassen.",
      noteLabel: "OpenBrief Notizseite",
    },
  },
  download: {
    hero: {
      badge: "Desktop-Versionen & Open Source",
      title: "OpenBrief für den Desktop herunterladen",
      body:
        "Installier die App, bring deine eigenen Provider-Schlüssel mit und behalte jedes Transkript, jede Zusammenfassung und jede exportierte Notiz unter deiner Kontrolle.",
      availabilitySuffix: "verfügbar",
      platforms: ["Mac", "Windows", "Linux"],
    },
    platformGroups: [
      { name: "macOS", builds: ["Apple Silicon", "Intel"] },
      { name: "Windows", builds: ["x64-Installer", "ARM64-Installer"] },
      { name: "Linux", builds: ["x64 AppImage", "Debian-Paket"] },
    ],
    releaseDescription:
      "Signierte Builds erscheinen hier, sobald das Packaging steht.",
    comingSoon: "Bald verfügbar",
    openSource: {
      title: "Open Source, wenn du willst",
      body:
        "OpenBrief entsteht offen. Lies den Code, verfolge den Packaging-Fortschritt oder bau es selbst, wann immer du genau sehen willst, was ausgeliefert wird.",
      cardTitle: "GitHub-Repository",
      cardBodyStart: "Der Code liegt unter",
      cardBodyEnd: "– schau rein, bleib dran oder bau aus dem Quellcode, während wir die öffentlichen Downloads vorbereiten.",
      cta: "Auf GitHub ansehen",
    },
    requirements: {
      title: "Voraussetzungen",
      body:
        "OpenBrief verarbeitet Medien lokal; Cloud-KI-Provider wählst du bei Bedarf selbst.",
      items: [
        "macOS 13, Windows 11 oder ein aktueller Linux-Desktop",
        "Lokaler Speicherplatz für importierte Medien und erzeugte Transkripte",
        "Optionaler API-Schlüssel für OpenAI, Anthropic, Gemini oder OpenRouter",
        "Optionale mitgelieferte Tools für YouTube und Offline-Transkription",
      ],
    },
  },
};

const frenchCopy: MarketingCopy = {
  nav: {
    features: "Fonctionnalités",
    download: "Télécharger",
    github: "GitHub",
  },
  footer: {
    description:
      "Un espace de travail local qui transforme tes longues vidéos et fichiers audio en briefings clairs et faciles à partager : résumés, réponses et notes prêtes à l'emploi.",
  },
  home: {
    hero: {
      badge: "Espace de briefing qui tourne en local",
      title: "Transforme tes longues vidéos en briefings exploitables.",
      bodyStrong: "OpenBrief",
      body:
        "transforme tes longues vidéos, fichiers audio et enregistrements en briefings clairs, sans corvée. Importe une source, obtiens une transcription, pose des questions dont les réponses restent ancrées dans ce qui a été dit, et exporte uniquement les notes utiles.",
      secondary:
        "Parfait pour les appels de recherche, cours, démos produit, entretiens et captures d'écran dont tu dois te souvenir bien après la fin.",
      cta: "Télécharger OpenBrief",
      platforms: ["Mac", "Windows", "Linux"],
      demoLabel: "Vidéo de démonstration d'OpenBrief",
    },
    stats: [
      { title: "Gratuit", body: "L'app de bureau est gratuite : pas d'abonnement, pas de compte à rebours d'essai." },
      { title: "Sans inscription", body: "Ouvre l'app et commence à résumer. Aucun compte requis." },
      { title: "Tes données, sur ta machine", body: "Tes fichiers et tout ce que produit OpenBrief restent sur ton ordinateur." },
    ],
    features: {
      badge: "Fonctionnalités",
      title: "Le plus important commence quand la vidéo se termine.",
      body:
        "Source, transcription, résumé, chat et export au même endroit : un simple récap ne vire jamais au chaos d'onglets et de notes éparpillées.",
      items: [
        {
          title: "Toutes tes sources au même endroit",
          body: "Ouvre enregistrements, démos, cours et vidéos web depuis une seule vue.",
        },
        {
          title: "Les sous-titres d'abord",
          body: "OpenBrief utilise les sous-titres existants et ne transcrit que si nécessaire.",
        },
        {
          title: "Des réponses fiables",
          body: "Pose tes questions et reçois des réponses ancrées directement dans la transcription, sans approximation.",
        },
        {
          title: "Export en Markdown",
          body: "Emporte résumés, décisions, horodatages et notes dans un fichier net qui te suit partout.",
        },
        {
          title: "Privé par défaut",
          body: "Tes fichiers et les notes générées ne quittent jamais ton appareil.",
        },
        {
          title: "Sans compte",
          body: "Télécharge l'app et commence à résumer : ni inscription, ni connexion.",
        },
      ],
    },
    workflow: {
      badge: "Comment ça marche",
      title: "De la source au résumé, sans perdre le fil.",
      body:
        "Commence dans ta bibliothèque, puis ouvre une source dès que tu veux la transcrire, la résumer et discuter avec.",
      libraryTitle: "Bibliothèque",
      libraryBody:
        "Ajoute un fichier local ou un lien web pris en charge, garde chaque détail de la source et prépare une file bien rangée avant de t'y mettre.",
      libraryLabel: "Vue bibliothèque d'OpenBrief",
      noteTitle: "Page de notes",
      noteBody:
        "Ouvre une source pour générer une transcription, rédiger un résumé ciblé et poser des questions fondées, le tout sans quitter le lecteur.",
      noteLabel: "Page de notes d'OpenBrief",
    },
  },
  download: {
    hero: {
      badge: "Versions bureau et open source",
      title: "Télécharge OpenBrief pour ton ordinateur",
      body:
        "Installe l'app, branche tes propres clés de fournisseur et garde chaque transcription, résumé et note exportée sous ton contrôle.",
      availabilitySuffix: "disponible",
      platforms: ["Mac", "Windows", "Linux"],
    },
    platformGroups: [
      { name: "macOS", builds: ["Apple Silicon", "Intel"] },
      { name: "Windows", builds: ["Installateur x64", "Installateur ARM64"] },
      { name: "Linux", builds: ["AppImage x64", "Paquet Debian"] },
    ],
    releaseDescription:
      "Les versions signées arriveront ici dès que le packaging sera en place.",
    comingSoon: "Bientôt disponible",
    openSource: {
      title: "Open source, si tu veux",
      body:
        "OpenBrief se développe au grand jour. Lis le code, suis l'avancement du packaging ou compile toi-même quand tu veux voir exactement ce qui est publié.",
      cardTitle: "Dépôt GitHub",
      cardBodyStart: "Le code se trouve sur",
      cardBodyEnd: "— jette un œil, suis le projet ou compile-le toi-même pendant qu'on prépare les téléchargements publics.",
      cta: "Voir sur GitHub",
    },
    requirements: {
      title: "Prérequis",
      body:
        "OpenBrief traite les médias en local, et c'est toi qui choisis les fournisseurs d'IA cloud, si tu en veux.",
      items: [
        "macOS 13, Windows 11 ou un bureau Linux récent",
        "De l'espace disque local pour les médias importés et les transcriptions générées",
        "Une clé API facultative pour OpenAI, Anthropic, Gemini ou OpenRouter",
        "Des outils intégrés facultatifs pour YouTube et la transcription hors ligne",
      ],
    },
  },
};

const indonesianCopy: MarketingCopy = {
  nav: {
    features: "Fitur",
    download: "Unduh",
    github: "GitHub",
  },
  footer: {
    description:
      "Ruang kerja yang berjalan lokal untuk mengubah video dan audio panjang menjadi briefing yang jelas dan mudah dibagikan—ringkasan, jawaban, dan catatan yang langsung bisa dipakai.",
  },
  home: {
    hero: {
      badge: "Ruang kerja briefing yang berjalan di lokal",
      title: "Ubah video panjang jadi briefing yang siap dipakai.",
      bodyStrong: "OpenBrief",
      body:
        "mengubah video, audio, dan rekaman panjang menjadi briefing yang rapi, tanpa ribet. Impor sumber, dapatkan transkrip, ajukan pertanyaan dengan jawaban yang berpijak pada isi aslinya, dan ekspor hanya catatan yang kamu butuhkan.",
      secondary:
        "Pas untuk panggilan riset, kuliah, demo produk, wawancara, dan rekaman layar yang harus kamu ingat lama setelah selesai.",
      cta: "Unduh OpenBrief",
      platforms: ["Mac", "Windows", "Linux"],
      demoLabel: "Video demo produk OpenBrief",
    },
    stats: [
      { title: "Gratis", body: "Aplikasi desktop gratis—tanpa paket berbayar, tanpa hitung mundur masa coba." },
      { title: "Tanpa daftar", body: "Buka aplikasi dan langsung meringkas. Tidak perlu akun." },
      { title: "Datamu, di perangkatmu", body: "Berkasmu dan semua yang dibuat OpenBrief tetap ada di komputermu." },
    ],
    features: {
      badge: "Fitur",
      title: "Yang penting justru setelah video selesai.",
      body:
        "Sumber, transkrip, ringkasan, chat, dan ekspor menyatu di satu tempat—sekadar mengulas tak pernah berubah jadi tumpukan tab dan catatan berserakan.",
      items: [
        {
          title: "Semua sumber di satu tempat",
          body: "Buka rekaman, demo, kuliah, dan video web dari satu tampilan.",
        },
        {
          title: "Utamakan caption",
          body: "OpenBrief memakai caption yang sudah ada dan hanya mentranskrip saat perlu.",
        },
        {
          title: "Jawaban yang bisa dipercaya",
          body: "Ajukan pertanyaan dan dapatkan jawaban yang langsung merujuk ke transkrip, tanpa mengarang.",
        },
        {
          title: "Ekspor ke Markdown",
          body: "Bawa ringkasan, keputusan, timestamp, dan catatan ke satu berkas rapi yang bisa dibawa ke mana saja.",
        },
        {
          title: "Privat secara default",
          body: "Berkas dan catatan yang dibuat tidak pernah keluar dari perangkatmu.",
        },
        {
          title: "Tanpa akun",
          body: "Unduh aplikasi dan langsung meringkas—tanpa daftar, tanpa login.",
        },
      ],
    },
    workflow: {
      badge: "Cara kerja",
      title: "Dari sumber ke ringkasan, tanpa kehilangan alur.",
      body:
        "Mulai dari pustaka, lalu buka sumber begitu kamu siap menyalin, meringkas, dan mengobrol dengannya.",
      libraryTitle: "Pustaka",
      libraryBody:
        "Tambahkan berkas lokal atau tautan web yang didukung, simpan tiap detail sumber, dan susun antrean yang rapi sebelum mulai.",
      libraryLabel: "Tampilan pustaka OpenBrief",
      noteTitle: "Halaman catatan",
      noteBody:
        "Buka sumber untuk membuat transkrip, menulis ringkasan yang fokus, dan mengajukan pertanyaan berdasar—semua tanpa meninggalkan pemutar.",
      noteLabel: "Halaman catatan OpenBrief",
    },
  },
  download: {
    hero: {
      badge: "Versi desktop & open source",
      title: "Unduh OpenBrief untuk desktop",
      body:
        "Pasang aplikasinya, pakai kunci penyedia milikmu sendiri, dan simpan setiap transkrip, ringkasan, serta catatan ekspor dalam kendalimu.",
      availabilitySuffix: "tersedia",
      platforms: ["Mac", "Windows", "Linux"],
    },
    platformGroups: [
      { name: "macOS", builds: ["Apple Silicon", "Intel"] },
      { name: "Windows", builds: ["Installer x64", "Installer ARM64"] },
      { name: "Linux", builds: ["AppImage x64", "Paket Debian"] },
    ],
    releaseDescription:
      "Versi bertanda tangan akan muncul di sini begitu proses packaging siap.",
    comingSoon: "Segera hadir",
    openSource: {
      title: "Open source, kalau kamu mau",
      body:
        "OpenBrief dikembangkan secara terbuka. Baca kodenya, ikuti perkembangan packaging, atau bangun sendiri kapan pun kamu ingin tahu persis apa yang dirilis.",
      cardTitle: "Repositori GitHub",
      cardBodyStart: "Kodenya ada di",
      cardBodyEnd: "—lihat-lihat, ikuti, atau bangun dari sumber sementara kami menyiapkan unduhan publik.",
      cta: "Lihat di GitHub",
    },
    requirements: {
      title: "Persyaratan",
      body:
        "OpenBrief memproses media secara lokal, sementara penyedia AI cloud kamu pilih sendiri kalau perlu.",
      items: [
        "macOS 13, Windows 11, atau desktop Linux terkini",
        "Ruang disk lokal untuk media yang diimpor dan transkrip yang dibuat",
        "Kunci API opsional untuk OpenAI, Anthropic, Gemini, atau OpenRouter",
        "Alat bawaan opsional untuk YouTube dan transkripsi offline",
      ],
    },
  },
};

const italianCopy: MarketingCopy = {
  nav: {
    features: "Funzionalità",
    download: "Download",
    github: "GitHub",
  },
  footer: {
    description:
      "Uno spazio di lavoro che gira in locale e trasforma video e audio lunghi in briefing chiari e facili da condividere: riassunti, risposte e note pronte all'uso.",
  },
  home: {
    hero: {
      badge: "Spazio di briefing che gira in locale",
      title: "Trasforma i video lunghi in briefing pronti all'uso.",
      bodyStrong: "OpenBrief",
      body:
        "trasforma video, audio e registrazioni lunghi in briefing chiari, senza fatica inutile. Importa una fonte, ottieni una trascrizione, fai domande con risposte ancorate a ciò che è stato detto ed esporta solo le note che ti servono.",
      secondary:
        "Perfetto per call di ricerca, lezioni, demo di prodotto, interviste e registrazioni dello schermo che devi ricordare a lungo dopo la fine.",
      cta: "Scarica OpenBrief",
      platforms: ["Mac", "Windows", "Linux"],
      demoLabel: "Video demo di OpenBrief",
    },
    stats: [
      { title: "Gratis", body: "L'app desktop è gratis: niente piano a pagamento, niente conto alla rovescia di prova." },
      { title: "Senza registrazione", body: "Apri l'app e inizia a riassumere. Nessun account richiesto." },
      { title: "I tuoi dati, sul tuo dispositivo", body: "I tuoi file e tutto ciò che OpenBrief genera restano sul tuo computer." },
    ],
    features: {
      badge: "Funzionalità",
      title: "Il bello inizia quando il video finisce.",
      body:
        "Fonte, trascrizione, riassunto, chat ed esportazione stanno insieme: un rapido ripasso non diventa mai un caos di schede e note sparse.",
      items: [
        {
          title: "Tutte le fonti in un posto",
          body: "Apri registrazioni, demo, lezioni e video web da un'unica vista.",
        },
        {
          title: "Prima i sottotitoli",
          body: "OpenBrief usa i sottotitoli già presenti e trascrive solo quando serve.",
        },
        {
          title: "Risposte di cui fidarti",
          body: "Fai domande e ricevi risposte ancorate direttamente alla trascrizione, senza inventare.",
        },
        {
          title: "Esporta in Markdown",
          body: "Porta riassunti, decisioni, timestamp e note in un file pulito che ti segue ovunque.",
        },
        {
          title: "Privato di default",
          body: "I tuoi file e le note generate non lasciano mai il dispositivo.",
        },
        {
          title: "Senza account",
          body: "Scarica l'app e inizia a riassumere: niente registrazione, niente login.",
        },
      ],
    },
    workflow: {
      badge: "Come funziona",
      title: "Dalla fonte al riassunto, senza perdere il filo.",
      body:
        "Parti dalla libreria e apri una fonte appena vuoi trascriverla, riassumerla e chattarci.",
      libraryTitle: "Libreria",
      libraryBody:
        "Aggiungi un file locale o un link web supportato, conserva ogni dettaglio della fonte e prepara una coda ordinata prima di iniziare.",
      libraryLabel: "Vista libreria di OpenBrief",
      noteTitle: "Pagina note",
      noteBody:
        "Apri una fonte per generare una trascrizione, scrivere un riassunto mirato e fare domande fondate, senza mai lasciare il player.",
      noteLabel: "Pagina note di OpenBrief",
    },
  },
  download: {
    hero: {
      badge: "Versioni desktop e open source",
      title: "Scarica OpenBrief per il desktop",
      body:
        "Installa l'app, usa le tue chiavi provider e tieni ogni trascrizione, riassunto e nota esportata sotto il tuo controllo.",
      availabilitySuffix: "disponibile",
      platforms: ["Mac", "Windows", "Linux"],
    },
    platformGroups: [
      { name: "macOS", builds: ["Apple Silicon", "Intel"] },
      { name: "Windows", builds: ["Installer x64", "Installer ARM64"] },
      { name: "Linux", builds: ["AppImage x64", "Pacchetto Debian"] },
    ],
    releaseDescription:
      "Le versioni firmate compariranno qui non appena il packaging sarà pronto.",
    comingSoon: "In arrivo",
    openSource: {
      title: "Open source, se vuoi",
      body:
        "OpenBrief si sviluppa allo scoperto. Leggi il codice, segui i progressi del packaging o compila da te quando vuoi vedere esattamente cosa viene rilasciato.",
      cardTitle: "Repository GitHub",
      cardBodyStart: "Il codice è su",
      cardBodyEnd: "— dagli un'occhiata, seguilo o compilalo da te mentre prepariamo i download pubblici.",
      cta: "Vedi su GitHub",
    },
    requirements: {
      title: "Requisiti",
      body:
        "OpenBrief elabora i media in locale, mentre i provider AI cloud li scegli tu, se vuoi.",
      items: [
        "macOS 13, Windows 11 o un desktop Linux attuale",
        "Spazio su disco locale per i media importati e le trascrizioni generate",
        "Una chiave API opzionale per OpenAI, Anthropic, Gemini o OpenRouter",
        "Strumenti integrati opzionali per YouTube e la trascrizione offline",
      ],
    },
  },
};

const portugueseCopy: MarketingCopy = {
  nav: {
    features: "Recursos",
    download: "Baixar",
    github: "GitHub",
  },
  footer: {
    description:
      "Um espaço de trabalho que roda local e transforma vídeos e áudios longos em briefings claros e fáceis de compartilhar: resumos, respostas e notas prontas para usar.",
  },
  home: {
    hero: {
      badge: "Espaço de briefing que roda local",
      title: "Transforme vídeos longos em briefings prontos para usar.",
      bodyStrong: "OpenBrief",
      body:
        "transforma vídeos, áudios e gravações longos em briefings claros, sem trabalho à toa. Importe uma fonte, gere uma transcrição, faça perguntas com respostas ancoradas no que foi dito e exporte só as notas que você precisa.",
      secondary:
        "Perfeito para chamadas de pesquisa, aulas, demos de produto, entrevistas e gravações de tela que você precisa lembrar muito depois de acabarem.",
      cta: "Baixar OpenBrief",
      platforms: ["Mac", "Windows", "Linux"],
      demoLabel: "Vídeo de demonstração do OpenBrief",
    },
    stats: [
      { title: "Grátis", body: "O app de desktop é grátis: sem plano pago, sem contagem regressiva de teste." },
      { title: "Sem cadastro", body: "Abra o app e comece a resumir. Não precisa de conta." },
      { title: "Seus dados, no seu aparelho", body: "Seus arquivos e tudo o que o OpenBrief gera ficam no seu computador." },
    ],
    features: {
      badge: "Recursos",
      title: "O que importa começa quando o vídeo acaba.",
      body:
        "Fonte, transcrição, resumo, chat e exportação ficam juntos—uma revisão rápida nunca vira uma bagunça de abas e notas soltas.",
      items: [
        {
          title: "Todas as fontes em um lugar",
          body: "Abra gravações, demos, aulas e vídeos da web em uma única tela.",
        },
        {
          title: "Legendas primeiro",
          body: "O OpenBrief usa as legendas que já existem e só transcreve quando precisa.",
        },
        {
          title: "Respostas em que dá pra confiar",
          body: "Faça perguntas e receba respostas ancoradas direto na transcrição, sem chute.",
        },
        {
          title: "Exporte para Markdown",
          body: "Leve resumos, decisões, marcações de tempo e notas para um arquivo limpo que vai com você para qualquer lugar.",
        },
        {
          title: "Privado por padrão",
          body: "Seus arquivos e as notas geradas nunca saem do seu aparelho.",
        },
        {
          title: "Sem conta",
          body: "Baixe o app e comece a resumir: sem cadastro, sem login.",
        },
      ],
    },
    workflow: {
      badge: "Como funciona",
      title: "Da fonte ao resumo, sem perder o fio.",
      body:
        "Comece na sua biblioteca e abra uma fonte assim que quiser transcrever, resumir e conversar com ela.",
      libraryTitle: "Biblioteca",
      libraryBody:
        "Adicione um arquivo local ou um link da web compatível, mantenha cada detalhe da fonte e organize uma fila limpa antes de começar.",
      libraryLabel: "Tela de biblioteca do OpenBrief",
      noteTitle: "Página de notas",
      noteBody:
        "Abra uma fonte para gerar uma transcrição, escrever um resumo direto ao ponto e fazer perguntas fundamentadas, tudo sem sair do player.",
      noteLabel: "Página de notas do OpenBrief",
    },
  },
  download: {
    hero: {
      badge: "Versões desktop e código aberto",
      title: "Baixe o OpenBrief para desktop",
      body:
        "Instale o app, use suas próprias chaves de provedor e mantenha cada transcrição, resumo e nota exportada sob o seu controle.",
      availabilitySuffix: "disponível",
      platforms: ["Mac", "Windows", "Linux"],
    },
    platformGroups: [
      { name: "macOS", builds: ["Apple Silicon", "Intel"] },
      { name: "Windows", builds: ["Instalador x64", "Instalador ARM64"] },
      { name: "Linux", builds: ["AppImage x64", "Pacote Debian"] },
    ],
    releaseDescription:
      "As versões assinadas aparecem aqui assim que o empacotamento estiver pronto.",
    comingSoon: "Em breve",
    openSource: {
      title: "Código aberto, se você quiser",
      body:
        "O OpenBrief é desenvolvido às claras. Leia o código, acompanhe o progresso do empacotamento ou compile você mesmo sempre que quiser ver exatamente o que é publicado.",
      cardTitle: "Repositório no GitHub",
      cardBodyStart: "O código está em",
      cardBodyEnd: "— dê uma olhada, acompanhe ou compile você mesmo enquanto preparamos os downloads públicos.",
      cta: "Ver no GitHub",
    },
    requirements: {
      title: "Requisitos",
      body:
        "O OpenBrief processa as mídias localmente, e os provedores de IA na nuvem você escolhe, se quiser.",
      items: [
        "macOS 13, Windows 11 ou um desktop Linux atual",
        "Espaço em disco local para as mídias importadas e as transcrições geradas",
        "Uma chave de API opcional para OpenAI, Anthropic, Gemini ou OpenRouter",
        "Ferramentas integradas opcionais para YouTube e transcrição offline",
      ],
    },
  },
};

const vietnameseCopy: MarketingCopy = {
  nav: {
    features: "Tính năng",
    download: "Tải xuống",
    github: "GitHub",
  },
  footer: {
    description:
      "Không gian làm việc chạy ngay trên máy, biến video và âm thanh dài thành bản tóm tắt rõ ràng, dễ chia sẻ—tóm tắt, câu trả lời và ghi chú dùng được ngay.",
  },
  home: {
    hero: {
      badge: "Không gian briefing chạy ngay trên máy",
      title: "Biến video dài thành bản tóm tắt dùng được ngay.",
      bodyStrong: "OpenBrief",
      body:
        "biến video, âm thanh và bản ghi dài thành bản tóm tắt gọn gàng, không rườm rà. Nhập nguồn, lấy bản chép lời, đặt câu hỏi với câu trả lời bám sát nội dung gốc, và chỉ xuất những ghi chú bạn cần.",
      secondary:
        "Hợp với cuộc gọi nghiên cứu, bài giảng, demo sản phẩm, phỏng vấn và bản ghi màn hình mà bạn cần nhớ rất lâu sau khi kết thúc.",
      cta: "Tải OpenBrief",
      platforms: ["Mac", "Windows", "Linux"],
      demoLabel: "Video demo sản phẩm OpenBrief",
    },
    stats: [
      { title: "Miễn phí", body: "Ứng dụng desktop miễn phí—không gói trả phí, không đếm ngược dùng thử." },
      { title: "Không cần đăng ký", body: "Mở ứng dụng và bắt đầu tóm tắt. Không cần tài khoản." },
      { title: "Dữ liệu nằm trên máy bạn", body: "Tệp của bạn và mọi thứ OpenBrief tạo ra đều ở lại trên máy bạn." },
    ],
    features: {
      badge: "Tính năng",
      title: "Điều quan trọng bắt đầu khi video kết thúc.",
      body:
        "Nguồn, bản chép lời, tóm tắt, chat và xuất nằm cùng một chỗ—xem lại nhanh không bao giờ biến thành mớ tab và ghi chú rải rác.",
      items: [
        {
          title: "Mọi nguồn ở một nơi",
          body: "Mở bản ghi, demo, bài giảng và video web từ một màn hình duy nhất.",
        },
        {
          title: "Ưu tiên phụ đề",
          body: "OpenBrief dùng phụ đề có sẵn và chỉ chép lời khi cần.",
        },
        {
          title: "Câu trả lời đáng tin",
          body: "Đặt câu hỏi và nhận câu trả lời gắn thẳng vào bản chép lời, không phỏng đoán.",
        },
        {
          title: "Xuất ra Markdown",
          body: "Mang tóm tắt, quyết định, mốc thời gian và ghi chú vào một tệp gọn gàng đi cùng bạn khắp nơi.",
        },
        {
          title: "Riêng tư mặc định",
          body: "Tệp của bạn và ghi chú được tạo không bao giờ rời khỏi thiết bị.",
        },
        {
          title: "Không cần tài khoản",
          body: "Tải ứng dụng và bắt đầu tóm tắt—không đăng ký, không đăng nhập.",
        },
      ],
    },
    workflow: {
      badge: "Cách hoạt động",
      title: "Từ nguồn đến tóm tắt, không đứt mạch.",
      body:
        "Bắt đầu trong thư viện, rồi mở một nguồn ngay khi bạn muốn chép lời, tóm tắt và trò chuyện với nó.",
      libraryTitle: "Thư viện",
      libraryBody:
        "Thêm tệp cục bộ hoặc liên kết web được hỗ trợ, giữ nguyên mọi chi tiết nguồn và sắp một hàng đợi gọn gàng trước khi bắt tay vào.",
      libraryLabel: "Màn hình thư viện OpenBrief",
      noteTitle: "Trang ghi chú",
      noteBody:
        "Mở một nguồn để tạo bản chép lời, viết bản tóm tắt tập trung và đặt câu hỏi có căn cứ—tất cả mà không rời trình phát.",
      noteLabel: "Trang ghi chú OpenBrief",
    },
  },
  download: {
    hero: {
      badge: "Bản desktop & mã nguồn mở",
      title: "Tải OpenBrief cho desktop",
      body:
        "Cài ứng dụng, dùng khóa nhà cung cấp của riêng bạn và giữ mọi bản chép lời, tóm tắt cùng ghi chú đã xuất trong tầm kiểm soát của bạn.",
      availabilitySuffix: "khả dụng",
      platforms: ["Mac", "Windows", "Linux"],
    },
    platformGroups: [
      { name: "macOS", builds: ["Apple Silicon", "Intel"] },
      { name: "Windows", builds: ["Trình cài đặt x64", "Trình cài đặt ARM64"] },
      { name: "Linux", builds: ["x64 AppImage", "Gói Debian"] },
    ],
    releaseDescription:
      "Bản dựng đã ký sẽ xuất hiện ở đây ngay khi quy trình đóng gói sẵn sàng.",
    comingSoon: "Sắp ra mắt",
    openSource: {
      title: "Mã nguồn mở, nếu bạn muốn",
      body:
        "OpenBrief được phát triển công khai. Đọc mã, theo dõi tiến độ đóng gói, hoặc tự build bất cứ khi nào bạn muốn thấy chính xác những gì được phát hành.",
      cardTitle: "Kho GitHub",
      cardBodyStart: "Mã nguồn nằm ở",
      cardBodyEnd: "— ghé xem, theo dõi hoặc tự build trong khi chúng tôi chuẩn bị bản tải công khai.",
      cta: "Xem trên GitHub",
    },
    requirements: {
      title: "Yêu cầu",
      body:
        "OpenBrief xử lý media ngay trên máy, còn nhà cung cấp AI đám mây thì bạn tự chọn nếu muốn.",
      items: [
        "macOS 13, Windows 11 hoặc desktop Linux hiện đại",
        "Dung lượng đĩa cục bộ cho media đã nhập và bản chép lời được tạo",
        "Khóa API tùy chọn cho OpenAI, Anthropic, Gemini hoặc OpenRouter",
        "Công cụ tích hợp tùy chọn cho YouTube và chép lời ngoại tuyến",
      ],
    },
  },
};

const arabicCopy: MarketingCopy = {
  nav: {
    features: "الميزات",
    download: "تنزيل",
    github: "GitHub",
  },
  footer: {
    description:
      "مساحة عمل تعمل محليًا تحوّل الفيديوهات والصوتيات الطويلة إلى موجزات واضحة وسهلة المشاركة: ملخصات وإجابات وملاحظات جاهزة للاستخدام.",
  },
  home: {
    hero: {
      badge: "مساحة موجزات تعمل محليًا",
      title: "حوّل الفيديوهات الطويلة إلى موجزات جاهزة للاستخدام.",
      bodyStrong: "OpenBrief",
      body:
        "يحوّل فيديوهاتك وصوتياتك وتسجيلاتك الطويلة إلى موجزات واضحة بلا عناء. استورد مصدرًا، واحصل على تفريغ، واطرح أسئلة تبقى إجاباتها مرتبطة بما قيل فعلًا، وصدّر الملاحظات التي تحتاجها فقط.",
      secondary:
        "مثالي لمكالمات البحث والمحاضرات وعروض المنتجات والمقابلات وتسجيلات الشاشة التي تحتاج إلى تذكّرها بعد انتهائها بوقت طويل.",
      cta: "تنزيل OpenBrief",
      platforms: ["Mac", "Windows", "Linux"],
      demoLabel: "فيديو توضيحي لمنتج OpenBrief",
    },
    stats: [
      { title: "مجاني", body: "تطبيق سطح المكتب مجاني—بلا خطة مدفوعة ولا عدّاد تجربة." },
      { title: "بلا تسجيل", body: "افتح التطبيق وابدأ التلخيص فورًا. لا حاجة إلى حساب." },
      { title: "بياناتك على جهازك", body: "تبقى ملفاتك وكل ما ينتجه OpenBrief على جهازك." },
    ],
    features: {
      badge: "الميزات",
      title: "المهم يبدأ بعد انتهاء الفيديو.",
      body:
        "المصدر والتفريغ والملخص والمحادثة والتصدير في مكان واحد—فلا تتحول المراجعة السريعة إلى فوضى من التبويبات والملاحظات المبعثرة.",
      items: [
        {
          title: "كل مصادرك في مكان واحد",
          body: "افتح التسجيلات والعروض والمحاضرات وفيديوهات الويب من شاشة واحدة.",
        },
        {
          title: "الترجمات أولًا",
          body: "يستخدم OpenBrief الترجمات الموجودة ولا يفرّغ الصوت إلا عند الحاجة.",
        },
        {
          title: "إجابات تثق بها",
          body: "اطرح أسئلتك واحصل على إجابات مرتبطة مباشرة بالتفريغ، بلا تخمين.",
        },
        {
          title: "تصدير إلى Markdown",
          body: "انقل الملخصات والقرارات والطوابع الزمنية والملاحظات إلى ملف نظيف يرافقك أينما ذهبت.",
        },
        {
          title: "خاص افتراضيًا",
          body: "ملفاتك والملاحظات المُنشأة لا تغادر جهازك أبدًا.",
        },
        {
          title: "بلا حساب",
          body: "نزّل التطبيق وابدأ التلخيص—بلا تسجيل ولا دخول.",
        },
      ],
    },
    workflow: {
      badge: "كيف يعمل",
      title: "من المصدر إلى الملخص، دون أن يفلت الخيط.",
      body:
        "ابدأ من مكتبتك، ثم افتح المصدر فور أن تكون جاهزًا لتفريغه وتلخيصه ومحادثته.",
      libraryTitle: "المكتبة",
      libraryBody:
        "أضف ملفًا محليًا أو رابط ويب مدعومًا، واحتفظ بكل تفاصيل المصدر، ورتّب قائمة نظيفة قبل أن تبدأ.",
      libraryLabel: "واجهة مكتبة OpenBrief",
      noteTitle: "صفحة الملاحظات",
      noteBody:
        "افتح مصدرًا لإنشاء تفريغ وكتابة ملخص مركّز وطرح أسئلة موثقة—كل ذلك دون مغادرة المشغّل.",
      noteLabel: "صفحة ملاحظات OpenBrief",
    },
  },
  download: {
    hero: {
      badge: "إصدارات سطح المكتب والمصدر المفتوح",
      title: "نزّل OpenBrief لسطح المكتب",
      body:
        "ثبّت التطبيق، واربط مفاتيح المزوّد الخاصة بك، واحتفظ بكل تفريغ وملخص وملاحظة مصدّرة تحت سيطرتك.",
      availabilitySuffix: "متاح",
      platforms: ["Mac", "Windows", "Linux"],
    },
    platformGroups: [
      { name: "macOS", builds: ["Apple Silicon", "Intel"] },
      { name: "Windows", builds: ["مثبّت x64", "مثبّت ARM64"] },
      { name: "Linux", builds: ["x64 AppImage", "حزمة Debian"] },
    ],
    releaseDescription:
      "ستظهر الإصدارات الموقّعة هنا فور جاهزية عملية التغليف.",
    comingSoon: "قريبًا",
    openSource: {
      title: "المصدر المفتوح، إن أردت",
      body:
        "يُطوَّر OpenBrief على المكشوف. اقرأ الكود، وتابع تقدّم التغليف، أو ابنِه بنفسك متى أردت أن ترى بالضبط ما يُطرح.",
      cardTitle: "مستودع GitHub",
      cardBodyStart: "الكود موجود في",
      cardBodyEnd: "— ألقِ نظرة، أو تابعه، أو ابنه من المصدر بينما نجهّز التنزيلات العامة.",
      cta: "عرض على GitHub",
    },
    requirements: {
      title: "المتطلبات",
      body:
        "يعالج OpenBrief الوسائط محليًا، أما مزودو الذكاء الاصطناعي السحابيون فتختارهم بنفسك عند الحاجة.",
      items: [
        "macOS 13 أو Windows 11 أو سطح مكتب Linux حديث",
        "مساحة قرص محلية للوسائط المستوردة والتفريغات المُنشأة",
        "مفتاح API اختياري لـ OpenAI أو Anthropic أو Gemini أو OpenRouter",
        "أدوات مرفقة اختيارية لـ YouTube والتفريغ دون اتصال",
      ],
    },
  },
};

const marketingCopy: Record<SupportedLocale, MarketingCopy> = {
  en: englishCopy,
  ko: koreanCopy,
  ja: japaneseCopy,
  zh: chineseCopy,
  es: spanishCopy,
  de: germanCopy,
  fr: frenchCopy,
  id: indonesianCopy,
  it: italianCopy,
  pt: portugueseCopy,
  vi: vietnameseCopy,
  ar: arabicCopy,
};

export function getMarketingCopy(locale: SupportedLocale) {
  return marketingCopy[locale];
}
