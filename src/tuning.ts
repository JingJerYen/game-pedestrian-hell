// 全部可調參數都在這裡。調手感 = 改這個檔案，存檔後瀏覽器會自動重新載入。

export const TUNING = {
  // ── 鏡頭（第三人稱、馬力歐賽車式低視角）──
  cameraHeight: 2.4, // 鏡頭離地高度
  cameraDistance: 6.0, // 鏡頭在玩家後方多遠（視角 2 第三人稱；視角 1 用下面 firstPerson.distance）
  cameraFov: 70, // 視野角度（越大越有速度感，也越魚眼）
  cameraLookAhead: 14, // 鏡頭看向玩家前方多遠的地面（決定俯角，兩個視角共用）
  cameraXDamp: 4, // 鏡頭橫向跟隨的平滑度（越大跟越緊）
  // 視角切換（右上角按鈕或 C 鍵，選擇記在瀏覽器）：
  // "fixed"  = 視角 2：第三人稱——用上面的 cameraDistance / cameraHeight，永遠看馬路前方、↑ 沿馬路走
  // "follow" = 視角 1：第一人稱——鏡頭在人物眼睛位置、跟著人物朝向轉、按鍵跟畫面（↑ 永遠往畫面前方）
  cameraModeDefault: "fixed" as "fixed" | "follow",
  firstPerson: {
    distance: -0.1, // 視角 1 的 cameraDistance（略往前免得看到自己）
    height: 1.5, // 視角 1 的 cameraHeight（眼睛高度）
    // 視線跟人物轉頭的方式是「snap」：對齊到最近的 45° 再幾乎瞬間轉過去（VR 的舒適做法）。
    // 試過平滑慢轉會暈、完全不轉又看不到側邊，snap 是折衷（與使用者確認）
    snapDamp: 14, // 跳到下一個 45° 的收斂速度（越大越接近瞬間；放開按鍵維持朝向，不回正）
    yawLimit: Math.PI / 2, // 視線最多離馬路前方幾度（弧度）：按的方向會轉超過這個角度就只走不轉頭（↓ = 看著前方倒退）
  },

  // ── 直式畫面（手機豎拿）鏡頭覆寫：畫面比例 < 1 時自動採用 ──
  // 直式水平視野窄，鏡頭要拉高拉遠＋加大 FOV 才看得到兩側車道
  cameraPortrait: {
    height: 4.6,
    distance: 8.0,
    fov: 82,
    lookAhead: 17,
  },

  // ── 道路佈局：【左人行道】【迎面車道×roadLanes】【雙黃線】【對向車道×bgLanes】【右人行道】──
  laneWidth: 2.6, // 每條車道（與人行道走位）的寬
  roadLanes: 2, // 迎面車道數
  bgLanes: 2, // 對向車道數（可以走過去，但對向車從你背後來、會撞死你）
  centerGap: 0.5, // 雙黃線區的寬度（原本的分隔島拆掉了）
  buildingGap: 0.2, // 建築物離人行道外緣多遠（調 0 就是騎樓直接貼著人行道）

  // ── 遠景大背景圖（以鏡頭為圓心的弧形大看板；圖放 public/assets/，載不到就純色天空）──
  backdrop: {
    // 輪換清單：每關換下一張（無限模式一路輪下去），關卡表可用 backdrop 欄位指定第幾張。
    // sky = 天空與霧的顏色，要配合那張圖地平線附近的霧色，接縫才看不出來（日落就配橘）。
    // horizonRatio 可個別覆寫（那張圖的天際線底部在畫面高度幾成處）；沒寫用下面的全域值。
    // 圖的規格見 public/assets/backdrops.md。
    sets: [
      { image: "assets/backdrop-taipei.jpg", sky: 0x87b5d9, horizonRatio: 0.17 }, // 台北 101 白天
      { image: "assets/backdrop-kaohsiung.jpg", sky: 0x9cc4ea, horizonRatio: 0.09 }, // 高雄 85 白天
      { image: "assets/backdrop-kaohsiung-sunset.jpg", sky: 0xf08058, horizonRatio: 0.15 }, // 高雄 85 日落
      { image: "assets/backdrop-taipei-night.jpg", sky: 0x4a4d78, horizonRatio: 0.15 }, // 台北 101 夜景
    ] as { image: string; sky: number; horizonRatio?: number }[],
    distance: 190, // 弧面半徑：要比霧的盡頭（160）遠、比鏡頭能看的最遠（300）近
    // 圖在世界裡的高度（公尺）＝天際線看起來多高的總開關：380 樓群很巨大、220 像遠處的城市。
    // 寬度不用管，弧面超出圖片的部分會鏡射延伸。上緣只要蓋過畫面頂就好（≥150 都夠）
    height: 220,
    arcDegrees: 170, // 弧長幾度：超出圖片寬度的部分用鏡射延伸（路口斜看出去才不會看穿）
    horizonRatio: 0.17, // 圖片的地平線在高度的幾成處（從下緣算起），所有圖都照這個規格出
    fadeHeight: 12, // 地平線往上這段高度漸漸融進霧色（蓋掉近處樓群的底部，天際線留著）；height 縮小時這個也要跟著縮
    topFadeHeight: 130, // 圖的上緣往下這段高度漸漸融進天空色：只留天際線附近的照片，往上都是霧色（抬頭看不到照片的深藍天空）
    follow: 0.85, // 鏡頭橫移時背景跟多少：1 = 像貼在螢幕上不動、0 = 固定在世界裡（視差最大）
  },

  // ── 路旁建築（連棟街屋：一棟接一棟沒有空隙，面寬窄、高度參差）──
  buildings: {
    frontageMin: 3.6, // 一般街屋的面寬（沿路方向，公尺）
    frontageMax: 5.5,
    wideChance: 0.12, // 偶爾來一棟寬的（公寓/商場）
    wideFrontageMin: 8,
    wideFrontageMax: 12,
    floorHeight: 3.2, // 每層樓高
    floorsMin: 2, // 樓層數範圍（高度 = 樓層 × 樓高）
    floorsMax: 6,
    depthMin: 6, // 往後延伸的深度（玩家看不太到，隨便）
    depthMax: 10,
  },
  // ── 玩家移動 ──
  walkSpeed: 4.2, // 按住 ↑ 的前進速度（公尺/秒）
  backSpeed: 3.5, // 按住 ↓ 的後退速度
  strafeSpeed: 5.5, // 按住 ←→ 的橫移速度（連續滑動，不吸附車道中心）
  walkAnimBaseSpeed: 3.5, // 走路動畫的基準速度：實際移動速度÷這個＝動畫播放倍率
  turnDamp: 14, // 轉身平滑度：角色外觀轉向按鍵方向（左右/後退/斜向）有多快，越大轉越俐落

  // ── 玩家型態（難度桿之一：體積越大越難閃、速度越慢。測試用按 1 輪替）──
  // speed = 速度倍率：前進/後退/橫移三個速度一起乘（1.0 = 上面的全域值）。關卡只要指定 playerForm，速度就跟著來
  playerForms: {
    walker: { size: { x: 0.8, y: 1.6, z: 0.8 }, color: 0x3b7bff, speed: 1.0 }, // 單人步行
    stroller: { size: { x: 0.9, y: 1.6, z: 1.8 }, color: 0x2bb5a0, speed: 0.9 }, // 推嬰兒車（前面多一截）
    wheelchair: { size: { x: 1.2, y: 1.45, z: 1.5 }, color: 0xe07b39, speed: 0.7 }, // 輪椅（更寬）
  },

  // ── 車種（難度桿之二：機車快、卡車大。weight = 出現比重，不用加總成 1）──
  vehicles: {
    // wander = 生成時偏離車道中心的最大量（機車會鑽邊邊，卡車乖乖走正中間）
    scooter: {
      size: { x: 0.9, y: 1.3, z: 2.0 },
      speedMin: 8,
      speedMax: 16,
      weight: 0.35,
      wander: 0.7,
      // 車流機車（motor1，紅車身＋騎士）的車身色：貼圖上的紅色換成這些，一色一款
      colors: [0xd23b3b, 0x333338, 0xf2f2f2, 0x8a8f96], // 紅、黑、白、銀
      redBand: { hueMin: -30, hueMax: 25, minSat: 0.3 }, // 「紅色車身」的判定（色相 ±、彩度下限）
      // 停放機車（gogoro，白車身）的車身色：貼圖上的白色換成這些，一色一款
      parkedColors: [0xffffff, 0x59ffff, 0xffc863, 0x82ff82], // 亮色系：純白、亮藍、亮黃、亮綠
      whiteBand: { maxSat: 0.35, minLight: 0.75 }, // 「白色車身」的判定：彩度低、亮度高（寬一點才吃得到 JPEG 邊緣雜訊）
      // foodpanda 外送機車（foodpanda.glb，粉紅車身＋騎士＋外送箱）：每台車流機車生成時有這個機率是它
      foodpanda: { chance: 0.35 },
    },
    car: {
      size: { x: 1.9, y: 1.4, z: 4.2 },
      speedMin: 6,
      speedMax: 13,
      weight: 0.5,
      wander: 0.15,
      colors: [0xd94f4f, 0xe8e8e8, 0x4fd97a, 0xf2c14e, 0x9b59d0, 0x555560],
    },
    truck: {
      size: { x: 2.3, y: 2.6, z: 7.6 },
      speedMin: 5,
      speedMax: 9,
      weight: 0.15,
      wander: 0,
      colors: [0x3d6b9e, 0x5e8f6a, 0x8a8a92, 0xc9a227],
    },
  },

  // ── 車流 ──
  spawnDistance: 90, // 車在玩家前方多遠生成
  despawnZ: 15, // 車跑到玩家後方多遠就回收
  bgSpawnInterval: 1.6, // 對向（背景）車的生成間隔
  followDistance: 7, // 跟車：與同車道前車的間隙小於這個就減速跟著開（不超車、不穿模）
  followXRange: 1.4, // 「同車道」判定：橫向差距在這以內算同一條線上
  avoidLookAhead: 16, // 同向車前方這麼遠有違停就往內側車道繞
  spawnClearZ: 10, // 生成點前後這段距離內該車道已經有車就不生（避免生在別人身上）

  // ── 人行道腳踏車（慢速但撞到也是死；出現頻率由關卡表 bikeInterval 控制）──
  // 方向永遠跟該側車流同向：左人行道的腳踏車迎面騎來、右人行道的從你背後來。
  // 遇到人行道路障就切到路邊車道、過了再切回來；在車道上跟汽車一樣排隊（跟車不超車），
  // 不會和車或路障穿模。
  bike: {
    size: { x: 0.6, y: 1.5, z: 1.8 },
    speedMin: 2.5, // 比行人快一點點的悠哉速度
    speedMax: 4.5,
    wander: 0.8, // 在人行道上偏來偏去的幅度
    colors: [0x2e7d5b, 0x8a4baf, 0xc2564b, 0x4a6fa5], // 沒模型時色塊的顏色
    // 騎士衣服顏色：ubike 模型載入時把貼圖上的淺藍衣服換成這些，一色一款（車身黃色不動）
    riderColors: [0x6fa8dc, 0xe05a5a, 0x3f8f5a, 0x333338, 0xf2f2f2, 0xe8a33c, 0x8a4baf],
    riderBand: { hueMin: 190, hueMax: 250, minSat: 0.2 }, // 「淺藍衣服」的判定（色相範圍、彩度下限）
    mergeLook: 8, // 人行道前方這麼近有路障就切到路邊車道
    returnLook: 12, // 在車道上時，人行道前方這麼遠都乾淨才切回去（要比 mergeLook 大，才不會來回抖）
    stopGap: 2.5, // 切不出去（車道有車或違停）時，離路障這麼近就煞停等
    cornerGap: 0.6, // 換道途中：車頭前方這麼近有路障就先別往前（斜切才不會擦到路障的角）
    sideMargin: 0.2, // 判斷路障擋不擋時，腳踏車兩側多留的餘裕
    laneChangeDamp: 3, // 切換車道的平滑度（越大切越快）
    // 切進車道前的空檔判斷：後方這段距離內有「比我快、正在接近」的車就先等它過。
    // 已經停著或比我慢的車不算——切進去之後它會乖乖排在腳踏車後面（跟車邏輯）
    mergeClearBehind: 14,
    // 同一側「人行道路障 ↔ 違停」之間至少留這麼多空隙（公尺），腳踏車才換得了道；
    // 不夠的話會繞出去回不來，卡在車道上把後面的車全塞住（obstacles.ts 生成時保證）
    passGap: 8,
    // 路口：右轉車會掃過人行道延伸段。掃過範圍 = 路口中心往前 sweepLen 公尺。
    // 範圍內有腳踏車 → 右轉車在路口停著等它過；範圍前 yieldDist 公尺內的腳踏車
    // 看到 turnerRange 內有右轉車接近 → 停下讓車。兩邊互相等，誰都不會輾過誰。
    sweepLen: 13,
    sweepBack: 2.5, // 掃過範圍從路口中心往「後」也算這麼多（右轉車車尾會往外甩）
    yieldDist: 6,
    turnerRange: 11,
  },

  // ── 公車停靠區（外側車道貼路邊線的長方形標線，裝飾）──
  busZone: {
    count: 2, // 同時存在幾個（循環使用，繞回遠處時換隨機一側）
    length: 13, // 縱深（公尺），約一台公車再多一點
    widthRatio: 0.66, // 佔外側車道寬的比例（貼著路邊白線）
  },

  // ── 路面標記（「慢」「50」：成對出現在同一側兩條車道、字向跟著車行方向）──
  roadMarkPairs: 2, // 同時存在幾組（一組 = 一側的每條車道各一個字）
  roadMarkLabels: ["慢", "50", "40"], // 標記種類（隨機挑），外觀在 skins.ts 的 makeRoadMark
  sidewalkMarkCount: 2, // 人行道上同時存在幾個直排「人行道」字（裝飾）

  // ── 死亡／過關字幕（後台自由編輯）──
  // 每種死法：title = 失敗畫面大標題；facts = 小知識池，死亡時隨機抽一條顯示
  // （池子留空陣列就不顯示小知識）。標「示例」的文字都等你替換。
  deathCaptions: {
    scooter: {
      title: "你被機車撞了 🛵",
      facts: [
        "2025 上半年 173 個行人陣亡，平均一天一個",
        "台灣每十萬人交通死亡數是日本的 4 倍",
        "腰部以下失去知覺與控制能力，終身坐輪椅😭",
        "失去工作能力，家裡經濟撐得住嗎?"
      ],
    },
    car: {
      title: "你被汽車撞了 🚗",
      facts: [
        "2024 年有 366 個行人被撞死，平均每天一個",
        "你是在玩台灣馬力歐?",
        "阿母還在等你回家...😭",
        "老婆小孩在等你回家...😭 (等等，你沒有女友?)"
      ],
    },
    truck: {
      title: "你被大卡車撞了 🚚",
      facts: [
        "司機根本沒看到你：大車有很多視線死角",
        "以台灣的生育率來說，這次投胎可能當不了台灣人了😢",
        "阿母還在等你回家...😭"
      ],
    },
    bike: {
      title: "你被人行道上的腳踏車撞了 🚲",
      facts: [
        "閃喔閃喔，撞到不負責啦",
        "哩喜咧烤? 依台灣法規，腳踏車禁止騎在人行道上 !!"
      ],
    },
    turning: {
      title: "右轉車沒有讓你 🚗💨",
      facts: [
        "Welcome to Taiwan!",
        "台灣路口：六成以上車禍發生地，禮讓行人只是課本上的美好願望",
        "過馬路不要滑手機喔，很危險",
        "這就是，台灣馬力歐真人版"
      ],
    },
    timeout: {
      title: "時間到 ⏰",
      facts: [
        "2024 年台灣車禍奪走 2,950 條命，平均每天有 8 個人沒能走到終點，跟你一樣",
        "這就是，台灣馬力歐真人版",
        "你遲到了...不過安全才是最重要!",
      ],
    },
  },
  // 過關字幕池：過關進下一關時，開場橫幅隨機抽一條（留空陣列就不顯示）
  clearFlavors: ["平安抵達，今天也活下來了"],

  // ── 命 ──
  maxHearts: 5, // 失敗扣一條，用完從第一關重來

  // ── 目的地總表 ──
  // key = 招牌字。每個目的地配一句開場小語（橫幅顯示）和可選的貼皮圖。
  // 手動關卡在 LEVELS 寫 destination: "公司" 就把小語和貼皮一起帶過去；無限模式從這張表隨機抽。
  // skin = public/assets/decals/destinations/<檔名>.jpg（規格見那個資料夾的 README）；
  // 有 skin 的目的地：方塊四面貼同一張立面圖；沒 skin 或檔案不在的，維持米色方塊＋canvas 招牌。想加場景就加一行。
  destinations: {
    公司: { flavor: "上班要遲到了啊啊啊", skin: "business" },
    全聯: { flavor: "去超市買零食~", skin: "pixmart" },
    蝦皮: { flavor: "取貨最後一天", skin: "shopee" },
    醫院: { flavor: "回診快過號了", skin: "hospital" },
    銀行: { flavor: "來去領錢", skin: "bank" },
  } as Record<string, { flavor: string; skin?: string }>,

  // ── 後方來車警示（畫面上的紅色「!」＋喇叭聲）──
  // 只提醒「會撞到」的：從背後來、橫向會擦到、幾秒內會追上的車（含人行道腳踏車）
  rearWarning: {
    seconds: 2.0, // 幾秒內會追上才提示（後方距離 ÷ 接近速度）
    lateral: 1.2, // 橫向：車和人的邊緣相距在這以內才算會擦到（公尺）
    maxDistance: 45, // 只看後方這麼遠以內的車
    hornCooldown: 3, // 喇叭聲最短間隔（秒）；聲音檔放 public/assets/sfx/horn.mp3，沒有就只有「!」
  },

  // ── 路口車用號誌上的路牌 ──
  // 路口依這個順序輪流用（第一個路口第一條、用完從頭），指的是橫向那條小路；路口內每支桿子都掛同一個
  streetNames: ["中正路一段", "中山路", "厚德路", "王大路", "叫我姐街", "潑婦罵街", "條條大路", "蓮夢路", "大馬路"],

  // ── 行人紅綠燈（台灣式：上格倒數數字、下格小綠人；永遠綠燈）──
  // 數字 = 本關剩餘秒數（跟 HUD 同一個計時器），超過 99 就顯示 99
  signal: {
    greenmanFrames: 8, // 小綠人 sprite sheet 橫排幾格（public/assets/decals/signals/greenman.png）
    walkFps: 4, // 小綠人平常每秒走幾格
    hurryFps: 10, // 倒數最後幾秒走快（跟真的一樣）
    hurryBelow: 10, // 剩幾秒以下開始走快
  },

  // ── 開場載入 ──
  // 第一關的橫幅會等街屋／車輛／號誌桿／角色模型全部載完才開始倒數（玩家不會看到佔位色塊）；
  // 網路太慢等超過這麼多秒就直接開始
  loadWaitMax: 30,

  // ── 撞擊效果（被撞那一刻起的一兩秒：定格 → 慢動作＋鏡頭震動＋紅閃；第一人稱鏡頭倒地朝天）──
  // 慢動作結束才出失敗畫面。超時（timeout）倍率 0 = 沒有這些，直接出畫面
  hitFx: {
    freezeSeconds: 0.08, // 定格：畫面凍住幾秒（乘兇手倍率）
    shakeSeconds: 0.45, // 鏡頭震動持續幾秒（定格結束後開始）
    shakeAmp: 0.22, // 震動幅度（公尺，乘兇手倍率），由大到小衰減
    slowSeconds: 1.5, // 慢動作持續幾秒
    slowScale: 0.3, // 慢動作時世界（車流、倒下動畫）跑幾倍速
    fall: { seconds: 1.0, height: 0.35, pitch: 0.8, roll: 0.35 }, // 第一人稱：幾秒內倒到地上、最後離地多高、抬頭看天角度（弧度）、側歪角度
    third: { drop: 1.3, closer: 0.55, roll: 0.18 }, // 第三人稱：鏡頭往下壓幾公尺、拉近到原距離的幾倍、側歪角度
    byCause: { truck: 2.0, car: 1.4, scooter: 1.0, bike: 0.5, timeout: 0 } as Record<string, number>, // 定格與震動的倍率
  },

  // ── 結算畫面 ──
  resultHoldSeconds: 2.5, // 失敗/通關畫面至少停留幾秒才接受按鍵（期間不顯示「按任意鍵」）

  // ── 靜止路障（擋路不致死；「多密、多常違停」由下面的關卡表決定）──
  // 人行道單顆路障池：一台停放的 Gogoro（沿路停或橫停），或 sidewalkProps 裡的道具模型（依 weight 抽）
  sidewalkScooterChance: 0.5, // 單顆路障是停放 Gogoro（而非道具）的機率
  // 道具模型：public/assets/models/props/<名>.glb。size = 模型正面朝 +Z 時的寬×高×深（公尺），
  // 擺到人行道會轉 90° 讓寬邊沿著路；模型還沒載好時是同尺寸的色塊。要加新道具就多寫一行
  sidewalkProps: {
    elecbox: { size: { x: 1.5, y: 1.45, z: 0.96 }, weight: 1 }, // 變電箱
  } as Record<string, { size: { x: number; y: number; z: number }; weight: number }>,
  obstacleSpawnZ: 96, // 路障生成在前方多遠（比車生成點再遠一點，避免疊到車）
  // 生成點附近有車（同向車、腳踏車）就先不生：縱向多看這麼多餘裕
  // （橫向不加餘裕：加了會伸進隔壁車道，路過的車會一直擋住人行道路障生成）
  obstacleSpawnMargin: { x: 0, z: 3 },

  // ── 停車格路段（人行道「靠馬路那半邊」直接換成停車格鋪面接手，
  //    靠建築那半邊仍是綠色走道；格子裡可能停著車）──
  parking: {
    chance: 0.95, // 人行道路障事件是「停車格路段」而非單顆路障的機率
    carChance: 0.35, // 停車格路段是汽車格（而非機車格）的機率——調高會看到滿街汽車格
    types: {
      // stripWidth 3.4 = 人行道視覺全寬（斷頭式人行道，整段被停車格接管）。
      // 注意：一段的長度 = 格數 × stallDepth；段越長，下一個事件會多讓開
      // 「段長一半」的距離，而且太長容易跟路口重疊被清掉——stallDepth 調大要節制。
      scooter: {
        stripWidth: 3.4,
        stallDepth: 1.0, // 機車「橫停」：一格 3.4 寬 × 1.0 深
        stallsMin: 6,
        stallsMax: 12, // 段長 6~12 公尺（格數每段隨機抽）
        occupancy: 0.8, // 每格停著車的機率（空格可以走過去）
        // 一格一台橫停的 Gogoro（模型 gogoro.glb，車身長 2.2 橫跨人行道）：
        // 兩側各剩 0.6 的縫，行人（寬 0.8）擠不過去 → 人行道還是封死，但看起來合理
        blockSize: { x: 2.2, y: 1.1, z: 0.8 },
      },
      car: {
        stripWidth: 3.4,
        stallDepth: 5.6, // 汽車「直停」：車頭朝前後（正常停法），一格 3.4 寬 × 5.6 深
        stallsMin: 2,
        stallsMax: 4, // 段長 11~22 公尺
        occupancy: 0.8,
        // 車寬 1.8 < 人行道 3.4：行人硬要擠是擠得過去的；完全封死是機車格的工作
        blockSize: { x: 1.8, y: 1.3, z: 4.4 },
      },
    },
  },

  // ── 路口（永遠綠燈；唯一威脅是迎面車右轉掃過斑馬線）──
  intersection: {
    firstAt: 40, // 每關第一個路口在幾公尺處
    everyMin: 40, // 之後每隔幾公尺一個路口（隨機取 min~max）
    everyMax: 90,
    roadDepth: 20, // 橫向小路的縱深（公尺）——縱向斑馬線要走多長就調這個
    spawnZ: 120, // 路口生成在前方多遠（生成點要藏在霧裡；測試時可暫調 40 就近看）
    turnChance: 0.8, // 靠人行道車道的迎面車在路口右轉的機率（卡車不轉）
    turnSeconds: 0.9, // 轉彎轉 90 度花幾秒（越短轉越兇）
  },

  // ── 無盡模式（手動 LEVELS 全過後接手；難度計算在 levelgen.ts）──
  // 一條走不完的路：沒有終點、沒有時限、一條命、固定步行者。
  // 每走 stageLength 公尺難度升一階，各參數從 *Start 線性爬到 *End，rampStages 階之後停在最兇值。
  // 分數 = 最遠走到幾公尺（最遠紀錄存在瀏覽器 localStorage）。
  endless: {
    stageLength: 100, // 每幾公尺升一階
    rampStages: 10, // 幾階爬到天花板（10 階 = 1000 m；調小每階跳得更多）
    spawnIntervalStart: 3.5, // 迎面車生成間隔（秒）：起點比手寫第一關還鬆
    spawnIntervalEnd: 0.45,
    speedScaleStart: 0.7, // 車速倍率
    speedScaleEnd: 1.6,
    obstacleGapMinStart: 12, // 路障間距（越小越密）
    obstacleGapMinEnd: 4,
    obstacleGapMaxStart: 24,
    obstacleGapMaxEnd: 9,
    roadChanceStart: 0.1, // 違停（路邊車道路障）機率
    roadChanceEnd: 0.5,
    turnChanceEnd: 0.7, // 路口右轉機率天花板（起點沿用 intersection.turnChance）
    bikeIntervalStart: 8, // 人行道腳踏車生成間隔（秒）
    bikeIntervalEnd: 2.5,
    entryFlavor: "走路環保又健康，但是有點危險...", // 進入無盡模式的橫幅小語
    stageFlavors: ["車好像變多了", "路越來越難走", "台灣的路是走不完的", "還活著嗎？"], // 升階提示輪流用（留空就只顯示公尺數）
  },

  // ── 碰撞 ──
  hitboxShrink: 1.0, // 致死碰撞箱是視覺大小的幾成（從寬判定：差點撞到 > 冤枉死）
  obstacleBlockShrink: 0.98, // 路障「擋住」判定的縮比：幾乎貼齊視覺，行人才不會穿模
} as const;

export type PlayerForm = keyof typeof TUNING.playerForms;
// 人行道鋪面樣式：normal = 綠鋪面＋「人行道」字；asphalt = 跟車道同色、有路緣白線、沒有字；
// none = 那一側沒有人行道——只有車道，建築直接貼到車道邊，行人走不進去，
// 也不會有停車格、路障、腳踏車、直向斑馬線。
export type SidewalkStyle = "normal" | "asphalt" | "none";
export type Side = "left" | "right";
export type VehicleType = keyof typeof TUNING.vehicles;
// 死法（＝deathCaptions 的鍵）："timeout" 以外的都是被車撞，由 traffic 回報兇手
export type DeathCause = keyof typeof TUNING.deathCaptions;

// ── 關卡表（後台調整用，玩家看不到）──
// 加關卡 = 加一個物件；順序就是關卡順序。
export interface LevelConfig {
  goalDistance: number; // 走到這個距離（公尺）就過關
  timeLimit: number; // 時限（秒），沒走到就失敗、重來本關
  playerForm: PlayerForm; // 這一關的行人型態（walker / stroller / wheelchair）；行人速度 = 全域速度 × playerForms[form].speed
  spawnInterval: number; // 迎面車生成間隔（秒），越小車越密
  speedScale: number; // 車速倍率（左右兩半都吃；想分開調用下面兩個欄位覆寫）
  obstacleGapMin: number; // 路障最小間距（公尺），越小路障越密
  obstacleGapMax: number;
  obstacleRoadChance: number; // 路障長在路邊車道（違停）而非人行道的機率
  // ↓ 可選：路口覆寫。沒寫就用 TUNING.intersection 的全域值。
  intersectionEveryMin?: number; // 路口間距（公尺）
  intersectionEveryMax?: number;
  turnChance?: number; // 路邊車道的車在路口右轉的機率
  // ↓ 可選：左右車速分開調（左＝迎面車道、右＝同向車道）。沒寫就用 speedScale。
  speedScaleLeft?: number;
  speedScaleRight?: number;
  // ↓ 可選：人行道腳踏車。沒寫 bikeInterval 這關就沒有腳踏車。
  //   方向固定跟該側車流同向（左側迎面騎來、右側從背後來），行為參數在 TUNING.bike。
  bikeInterval?: number; // 每隔幾秒生成一台（左右人行道隨機）
  // ↓ 可選：過關地點。指定後，走到 goalDistance 還要「站上該側人行道」才過關，
  //   時間照跑。終點會出現一棟目的地建築（外觀在 skins.ts 的 makeDestinationBuilding）。
  goalSide?: "left" | "right";
  destination?: string; // 目的地：填 TUNING.destinations 的 key（如「公司」），招牌字、小語、貼皮一起帶過來
  // ↓ 可選：覆寫開場橫幅的小語。不填就用目的地自己那句；填空字串就不顯示
  flavorText?: string;
  // ↓ 可選：這關用 TUNING.backdrop.sets 的第幾張背景（0 起算）；不填就依關數輪換
  backdrop?: number;
  // ↓ 可選：左右人行道各自的樣式（normal 綠鋪面 / asphalt 跟車道同色沒有字 / none 沒有人行道只有車道）；
  //   不填 = normal。goalSide 指到 none 的那側時，「站上路邊車道」就算到達
  sidewalkLeft?: SidewalkStyle;
  sidewalkRight?: SidewalkStyle;
  // ↓ 可選：提示開關。目的地建築照樣會出現，只是不告訴玩家在哪/多遠——讓他自己找
  hideSideHint?: boolean; // true = 不提示終點在左/右側（橫幅、HUD、「到了！」提示都不出現）
  hideDistanceHint?: boolean; // true = 不顯示目標距離（HUD 只顯示已走公尺數）
}

export const LEVELS: LevelConfig[] = [
  {
    goalDistance: 100,
    timeLimit: 99,
    playerForm: "walker",
    spawnInterval: 3.0,
    speedScale: 0.8,
    obstacleGapMin: 2,
    obstacleGapMax: 5,
    obstacleRoadChance: 0.1,
    bikeInterval: 5, // 這關開始人行道有腳踏車
    goalSide: "right",
    destination: "公司",
    backdrop: 0,
  },
  {
    goalDistance: 120,
    timeLimit: 99,
    playerForm: "walker",
    spawnInterval: 2.5,
    speedScale: 1.1,
    obstacleGapMin: 2,
    obstacleGapMax: 3,
    obstacleRoadChance: 0.1,
    bikeInterval: 5, // 這關開始人行道有腳踏車
    goalSide: "right",
    destination: "銀行",
    sidewalkLeft: "asphalt", // 左側人行道跟車道同色、沒有字
    sidewalkRight: "asphalt",
    backdrop: 1,
  },
  {
    goalDistance: 120,
    timeLimit: 99,
    playerForm: "stroller",
    spawnInterval: 2.5,
    speedScale: 1.0,
    obstacleGapMin: 2,
    obstacleGapMax: 4,
    obstacleRoadChance: 0.3,
    bikeInterval: 5,
    intersectionEveryMin: 20,
    intersectionEveryMax: 40,
    goalSide: "left",
    destination: "全聯",
    sidewalkLeft: "asphalt", // 左側人行道跟車道同色、沒有字
    sidewalkRight: "none",
    backdrop: 2
  },
  {
    goalDistance: 120,
    timeLimit: 99,
    playerForm: "wheelchair",
    spawnInterval: 2.5,
    speedScale: 1.0,
    obstacleGapMin: 2,
    obstacleGapMax: 4,
    obstacleRoadChance: 0.1,
    bikeInterval: 5,
    intersectionEveryMin: 20,
    intersectionEveryMax: 40,
    goalSide: "right",
    destination: "醫院",
    sidewalkLeft: "normal", // 左側人行道跟車道同色、沒有字
    sidewalkRight: "asphalt",
    backdrop: 3
  },
  {
    goalDistance: 160,
    timeLimit: 99,
    playerForm: "walker",
    spawnInterval: 1.5,
    speedScale: 1.1,
    obstacleGapMin: 2,
    obstacleGapMax: 5,
    obstacleRoadChance: 0.1,
    bikeInterval: 5, // 這關開始人行道有腳踏車
    sidewalkLeft: "none", // 左側人行道跟車道同色、沒有字
    sidewalkRight: "asphalt",
    destination: "蝦皮",
    goalSide: "left",
    backdrop: 0,
  },
  {
    goalDistance: 180,
    timeLimit: 99,
    playerForm: "wheelchair",
    spawnInterval: 2.5,
    speedScale: 1.0,
    obstacleGapMin: 2,
    obstacleGapMax: 4,
    obstacleRoadChance: 0.1,
    bikeInterval: 5,
    intersectionEveryMin: 20,
    intersectionEveryMax: 40,
    goalSide: "left",
    destination: "公司",
    sidewalkLeft: "normal", // 左側人行道跟車道同色、沒有字
    sidewalkRight: "asphalt",
    backdrop: 1
  },
  {
    goalDistance: 180,
    timeLimit: 99,
    playerForm: "stroller",
    spawnInterval: 2.5,
    speedScale: 1.0,
    obstacleGapMin: 2,
    obstacleGapMax: 4,
    obstacleRoadChance: 0.1,
    bikeInterval: 5,
    intersectionEveryMin: 20,
    intersectionEveryMax: 40,
    goalSide: "right",
    destination: "蝦皮",
    sidewalkLeft: "none", // 左側人行道跟車道同色、沒有字
    sidewalkRight: "normal",
    backdrop: 2
  },
  {
    goalDistance: 200,
    timeLimit: 99,
    playerForm: "walker",
    spawnInterval: 5.0,
    speedScale: 2.0,
    obstacleGapMin: 2,
    obstacleGapMax: 4,
    obstacleRoadChance: 0.0,
    bikeInterval: 8,
    intersectionEveryMin: 20,
    intersectionEveryMax: 40,
    goalSide: "right",
    destination: "全聯",
    sidewalkLeft: "normal", // 左側人行道跟車道同色、沒有字
    sidewalkRight: "normal",
    backdrop: 3
  },
];

// 依 weight 比重隨機抽一種車
export function randomVehicleType(): VehicleType {
  const entries = Object.entries(TUNING.vehicles) as [
    VehicleType,
    { weight: number },
  ][];
  let roll = Math.random() * entries.reduce((sum, [, v]) => sum + v.weight, 0);
  for (const [type, v] of entries) {
    roll -= v.weight;
    if (roll <= 0) return type;
  }
  return entries[entries.length - 1][0];
}

// ── 佈局換算（改上面的參數就好，下面不用動）──

// 迎面車道右緣（雙黃線從這裡開始）
export const ROAD_RIGHT = (TUNING.roadLanes - 0.5) * TUNING.laneWidth;
// 對向車道左緣／右緣
export const BG_LEFT = ROAD_RIGHT + TUNING.centerGap;
export const BG_RIGHT = BG_LEFT + TUNING.bgLanes * TUNING.laneWidth;
// 右人行道的走位中心
export const RIGHT_SIDEWALK_X = BG_RIGHT + TUNING.laneWidth / 2;

// 直欄編號：0=左人行道、1..roadLanes=迎面車道、
// roadLanes+1..LAST_ROAD_COL=對向車道、RIGHT_SIDEWALK_COL=右人行道
export const LAST_ROAD_COL = TUNING.roadLanes + TUNING.bgLanes;
export const RIGHT_SIDEWALK_COL = LAST_ROAD_COL + 1;
export function colX(col: number): number {
  if (col <= TUNING.roadLanes) return (col - 1) * TUNING.laneWidth; // 含左人行道(0)
  if (col <= LAST_ROAD_COL)
    return BG_LEFT + (col - TUNING.roadLanes - 0.5) * TUNING.laneWidth;
  return RIGHT_SIDEWALK_X;
}

// 人行道的視覺寬度（world.ts、停車格與目的地建築的定位共用）
export const SIDEWALK_WIDTH = TUNING.laneWidth + 0.8;
// 迎面車道左緣（左人行道右緣）
export const ROAD_LEFT = -TUNING.laneWidth / 2;

// 玩家橫移範圍的最大值：整條人行道（含貼建築的邊緣）都能走
// （那一側沒有人行道時實際範圍會縮到車道邊，見下面 walkMinX / walkMaxX）
export const WALK_MIN_X = ROAD_LEFT - SIDEWALK_WIDTH;
export const WALK_MAX_X = BG_RIGHT + SIDEWALK_WIDTH;

// ── 目前這關的人行道配置（main.ts 每關開始時設定；各模組讀這裡，不要自己記）──
export const LAYOUT: { left: SidewalkStyle; right: SidewalkStyle } = {
  left: "normal",
  right: "normal",
};
export function hasSidewalk(side: Side): boolean {
  return LAYOUT[side] !== "none";
}
// 目前可走的橫向範圍：有人行道到人行道外緣，沒有就到車道邊
export function walkMinX(): number {
  return hasSidewalk("left") ? WALK_MIN_X : ROAD_LEFT;
}
export function walkMaxX(): number {
  return hasSidewalk("right") ? WALK_MAX_X : BG_RIGHT;
}
// 建築前緣所在的線（人行道外緣；沒人行道就是車道邊）——建築、目的地、紅綠燈都貼這條線
export function buildingLineX(side: Side): number {
  return side === "left" ? walkMinX() - TUNING.buildingGap : walkMaxX() + TUNING.buildingGap;
}
