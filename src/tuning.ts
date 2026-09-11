// 全部可調參數都在這裡。調手感 = 改這個檔案，存檔後瀏覽器會自動重新載入。

export const TUNING = {
  // ── 鏡頭（第三人稱、馬力歐賽車式低視角）──
  cameraHeight: 2.4, // 鏡頭離地高度
  cameraDistance: 6.0, // 鏡頭在玩家後方多遠
  cameraFov: 70, // 視野角度（越大越有速度感，也越魚眼）
  cameraLookAhead: 14, // 鏡頭看向玩家前方多遠的地面
  cameraXFollow: 1.0, // 橫移時鏡頭跟過去的比例（0=固定不動、1=完全跟隨）
  cameraXDamp: 4, // 鏡頭橫向跟隨的平滑度（越大跟越緊）

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
  backSpeed: 2.6, // 按住 ↓ 的後退速度
  strafeSpeed: 5.5, // 按住 ←→ 的橫移速度（連續滑動，不吸附車道中心）
  walkAnimBaseSpeed: 3.5, // 走路動畫的基準速度：實際移動速度÷這個＝動畫播放倍率
  turnDamp: 14, // 轉身平滑度：角色外觀轉向按鍵方向（左右/後退/斜向）有多快，越大轉越俐落

  // ── 玩家型態（難度桿之一：體積越大越難閃。測試用按 1 輪替）──
  playerForms: {
    walker: { size: { x: 0.8, y: 1.6, z: 0.8 }, color: 0x3b7bff }, // 單人步行
    stroller: { size: { x: 0.9, y: 1.6, z: 1.8 }, color: 0x2bb5a0 }, // 推嬰兒車（前面多一截）
    wheelchair: { size: { x: 1.2, y: 1.45, z: 1.5 }, color: 0xe07b39 }, // 輪椅（更寬）
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
      // 車身顏色：motor1 模型載入時把貼圖上的紅色車身換成這些色（vehicleskins.ts 換色）
      colors: [0xd23b3b, 0x333338, 0xf2f2f2, 0x8a8f96], // 紅、黑、白、銀
      // 騎士衣服顏色：貼圖上的藍色衣服換成這些
      riderColors: [0x2f6fb5, 0x333338, 0xe8e8e8, 0x7a4b9c, 0x3f8f5a, 0xc9752c, 0x8f6b4e],
      recolorVariants: 8, // 一次生出幾款配色（車身依序輪、衣服隨機配）
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
    colors: [0x2e7d5b, 0x8a4baf, 0xc2564b, 0x4a6fa5],
    mergeLook: 8, // 人行道前方這麼近有路障就切到路邊車道
    returnLook: 12, // 在車道上時，人行道前方這麼遠都乾淨才切回去（要比 mergeLook 大，才不會來回抖）
    stopGap: 2.5, // 切不出去（車道有車或違停）時，離路障這麼近就煞停等
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
      facts: ["（示例）機車事故是台灣交通死傷的最大宗"],
    },
    car: {
      title: "你被汽車撞了 🚗",
      facts: ["（示例）台灣每年有上千名行人在人行道被撞"],
    },
    truck: {
      title: "你被大卡車撞了 🚚",
      facts: ["（示例）大車視野死角很大——你看得到車，不代表司機看得到你"],
    },
    bike: {
      title: "你被人行道上的腳踏車撞了 🚲",
      facts: ["（示例）連人行道都不安全，這就是行人地獄"],
    },
    turning: {
      title: "右轉車沒有讓你 🚗💨",
      facts: ["（示例）台灣行人死亡率是東亞最高等級"],
    },
    timeout: {
      title: "時間到 ⏰",
      facts: ["（示例）在台灣走路，永遠比你想的更花時間"],
    },
  },
  // 過關字幕池：過關進下一關時，開場橫幅隨機抽一條（留空陣列就不顯示）
  clearFlavors: ["平安抵達，今天也活下來了"],

  // ── 命 ──
  maxHearts: 3, // 失敗扣一條，用完從第一關重來

  // ── 結算畫面 ──
  resultHoldSeconds: 2.5, // 失敗/通關畫面至少停留幾秒才接受按鍵（期間不顯示「按任意鍵」）

  // ── 靜止路障（擋路不致死；「多密、多常違停」由下面的關卡表決定）──
  sidewalkObstacleSize: { x: 2.2, y: 1.3, z: 2.8 }, // 人行道路障（機車堆、攤販…）
  obstacleSpawnZ: 96, // 路障生成在前方多遠（比車生成點再遠一點，避免疊到車）
  // 生成點附近有車（同向車、腳踏車）就先不生：橫向/縱向各多看這麼多餘裕
  obstacleSpawnMargin: { x: 0.6, z: 3 },

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
        blockSize: { x: 3.2, y: 1.1, z: 0.8 }, // 一整排橫停機車，填滿格寬 → 人行道封死
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
    firstAt: 50, // 每關第一個路口在幾公尺處
    everyMin: 70, // 之後每隔幾公尺一個路口（隨機取 min~max）
    everyMax: 110,
    roadDepth: 14, // 橫向小路的縱深（公尺）——縱向斑馬線要走多長就調這個
    spawnZ: 120, // 路口生成在前方多遠（生成點要藏在霧裡；測試時可暫調 40 就近看）
    turnChance: 0.35, // 靠人行道車道的迎面車在路口右轉的機率（卡車不轉）
    turnSeconds: 0.9, // 轉彎轉 90 度花幾秒（越短轉越兇）
  },

  // ── 無限模式（手動 LEVELS 全過後無縫接手；生成邏輯在 levelgen.ts）──
  // 「一直爬」：難度在 rampLevels 關內爬到天花板，之後所有參數停在最兇值，
  // 玩的是「你能撐到第幾關」。各 *Max/*End 是天花板，嫌不夠兇就調。
  endless: {
    seed: 20260910, // 固定種子：每個玩家的第 N 關一模一樣（排行榜才公平）。改它＝換一整套關卡
    rampLevels: 25, // 幾關內把難度爬到天花板
    goalBase: 180, // 目標距離 = goalBase + 關深×goalPerLevel + 抖動，封頂 goalMax
    goalPerLevel: 12,
    goalJitter: 50,
    goalMax: 380, // 距離不無限變長（太長會無聊），難度靠密度和車速堆
    marginStart: 2.2, // 時限餘裕 = 直走所需秒數的幾倍；永遠 > 1 = 永遠走得完（公平鐵則）
    marginEnd: 1.35,
    spawnIntervalStart: 1.2, // 迎面車生成間隔（秒）
    spawnIntervalMin: 0.45,
    speedScaleMax: 1.6, // 車速倍率天花板
    obstacleGapMinStart: 12, // 路障間距（越小越密）
    obstacleGapMinEnd: 4,
    obstacleGapMaxStart: 24,
    obstacleGapMaxEnd: 9,
    roadChanceStart: 0.2, // 違停（路邊車道路障）機率
    roadChanceEnd: 0.5,
    turnChanceEnd: 0.7, // 路口右轉機率天花板（起點沿用 intersection.turnChance）
    bikeIntervalStart: 6, // 人行道腳踏車生成間隔（秒）
    bikeIntervalEnd: 2.5,
    formWeights: { walker: 0.5, stroller: 0.3, wheelchair: 0.2 }, // 行人型態抽選權重
    sideHintUntil: 4, // 無限模式第幾關之後，不再提示終點在哪側（自己找目的地大樓）
    entryFlavor: "你以為到了？台灣的路是走不完的", // 進入無限模式第一關的橫幅小語
    destinations: [
      // 目的地招牌字 + 配套的風味小語（隨機抽）；想加場景就加一行
      { label: "公司", flavor: "趕著打卡" },
      { label: "超商", flavor: "包裹保存最後一天" },
      { label: "郵局", flavor: "掛號快截止了" },
      { label: "醫院", flavor: "回診快來不及了" },
      { label: "托嬰中心", flavor: "寶寶快遲到了" },
      { label: "學校", flavor: "家長日要開始了" },
      { label: "夜市", flavor: "朋友已經在排隊" },
      { label: "火車站", flavor: "火車不等人" },
      { label: "銀行", flavor: "三點半前要軋進去" },
      { label: "宮廟", flavor: "吉時快過了" },
    ],
  },

  // ── 碰撞 ──
  hitboxShrink: 0.75, // 致死碰撞箱是視覺大小的幾成（從寬判定：差點撞到 > 冤枉死）
  obstacleBlockShrink: 0.98, // 路障「擋住」判定的縮比：幾乎貼齊視覺，行人才不會穿模
} as const;

export type PlayerForm = keyof typeof TUNING.playerForms;
export type VehicleType = keyof typeof TUNING.vehicles;
// 死法（＝deathCaptions 的鍵）："timeout" 以外的都是被車撞，由 traffic 回報兇手
export type DeathCause = keyof typeof TUNING.deathCaptions;

// ── 關卡表（後台調整用，玩家看不到）──
// 加關卡 = 加一個物件；順序就是關卡順序。
export interface LevelConfig {
  goalDistance: number; // 走到這個距離（公尺）就過關
  timeLimit: number; // 時限（秒），沒走到就失敗、重來本關
  playerForm: PlayerForm; // 這一關的行人型態（walker / stroller / wheelchair）
  spawnInterval: number; // 迎面車生成間隔（秒），越小車越密
  speedScale: number; // 車速倍率（左右兩半都吃；想分開調用下面兩個欄位覆寫）
  obstacleGapMin: number; // 路障最小間距（公尺），越小路障越密
  obstacleGapMax: number;
  obstacleRoadChance: number; // 路障長在路邊車道（違停）而非人行道的機率
  // ↓ 可選：行人速度覆寫。沒寫就用上面 TUNING 的全域值。
  //   例：輪椅關想更慢就加 walkSpeed: 3.2（推薦連 strafeSpeed 一起調，比例才對）
  walkSpeed?: number; // 前進速度（公尺/秒）
  backSpeed?: number; // 後退速度
  strafeSpeed?: number; // 橫移速度
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
  destinationLabel?: string; // 目的地建築的招牌字（之後換貼皮）
  // ↓ 可選：關卡風味小語（如「趕著打卡」），顯示在開場橫幅；不填就不顯示
  flavorText?: string;
  // ↓ 可選：這關用 TUNING.backdrop.sets 的第幾張背景（0 起算）；不填就依關數輪換
  backdrop?: number;
  // ↓ 可選：提示開關。目的地建築照樣會出現，只是不告訴玩家在哪/多遠——讓他自己找
  hideSideHint?: boolean; // true = 不提示終點在左/右側（橫幅、HUD、「到了！」提示都不出現）
  hideDistanceHint?: boolean; // true = 不顯示目標距離（HUD 只顯示已走公尺數）
}

export const LEVELS: LevelConfig[] = [
  {
    goalDistance: 20,
    timeLimit: 90,
    playerForm: "walker",
    spawnInterval: 1.3,
    speedScale: 1.0,
    obstacleGapMin: 2,
    obstacleGapMax: 5,
    obstacleRoadChance: 0.1,
    bikeInterval: 5, // 這關開始人行道有腳踏車
    goalSide: "right",
    destinationLabel: "公司",
    flavorText: "趕著打卡",
    hideSideHint: true,
  },
  {
    goalDistance: 30,
    timeLimit: 30,
    playerForm: "stroller",
    spawnInterval: 1.0,
    speedScale: 1.1,
    obstacleGapMin: 10,
    obstacleGapMax: 20,
    obstacleRoadChance: 0.3,
    bikeInterval: 5,
    goalSide: "left",
    destinationLabel: "托嬰中心",
    flavorText: "寶寶快遲到了",
  },
  {
    goalDistance: 35,
    timeLimit: 40,
    playerForm: "wheelchair",
    spawnInterval: 0.8,
    speedScale: 1.2,
    obstacleGapMin: 9,
    obstacleGapMax: 18,
    obstacleRoadChance: 0.35,
    bikeInterval: 3.5,
    goalSide: "right",
    destinationLabel: "醫院",
    flavorText: "回診快來不及了",
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

// 玩家橫移範圍：整條人行道（含貼建築的邊緣）都能走
export const WALK_MIN_X = ROAD_LEFT - SIDEWALK_WIDTH;
export const WALK_MAX_X = BG_RIGHT + SIDEWALK_WIDTH;
