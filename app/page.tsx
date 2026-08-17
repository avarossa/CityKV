"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ChangeEvent } from "react";

const FIXED_GENERATION_CONFIG = {
  resolution: "2K",
  aspectRatio: "16:9",
} as const;

// 客户端图片压缩：缩放到最长边不超过 MAX_DIM px，转为 JPEG 减小体积
const MAX_DIM = 1024;
const JPEG_QUALITY = 0.85;

async function compressImage(file: File): Promise<File> {
  // 只处理超过限制的图片，小图直接返回
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width <= MAX_DIM && height <= MAX_DIM) {
        resolve(file);
        return;
      }
      if (width > height) {
        height = Math.round((height / width) * MAX_DIM);
        width = MAX_DIM;
      } else {
        width = Math.round((width / height) * MAX_DIM);
        height = MAX_DIM;
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(file); return; }
          resolve(new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }));
        },
        "image/jpeg",
        JPEG_QUALITY,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

const MODEL_OPTIONS = [
  { value: "gemini-3-pro-image", label: "Nano Banana Pro" },
] as const;

type ModelId = (typeof MODEL_OPTIONS)[number]["value"];

const DEFAULT_MODEL: ModelId = "gemini-3-pro-image";

const DEFAULT_PROMPT = `
# 生成任务
任务标题：「{{活动标题}}」
视觉氛围：{{氛围}}

请根据任务标题、视觉氛围与输入的四张参考图，一次性生成一张完整的城市系列主视觉海报。

输出1920×1080、16:9横版。所有固定主体、品牌模块与城市元素必须完整入画，不得裁切、扩图或自动重新取景。

下文中的"任务标题"和"视觉氛围"均调用本段设定。用户后续只需修改本段两项内容。

# 零、最高优先级：复现图一构图

图一不是灵感参考，而是必须复现的目标构图底稿。请保持图一的相机、透视、画面分区、主体占位和不对称视觉平衡，只把灰色占位区域转化为最终城市环境与材质。

最终画面必须是：

- 左侧大型品牌爱心与台座。
- 右上任务标题。
- 城市元素位于中景、后景和画面四周。
- 左上、左下、右下保留固定品牌模块。

这是"左侧主体＋右侧标题"的非对称构图，不是中心对称海报。禁止把爱心和台座移到画面中央，禁止形成中央纪念碑、中央喷泉、中央舞台或中轴对称广场；禁止把标题移动到顶部中央。

要求优先级：

1. 图一的构图、品牌爱心母模、台座、标题与品牌模块。
2. 图四中的九个城市元素。
3. 任务标题与视觉氛围。
4. 图二的画面风格。
5. 图三的爱心城市化外观倾向。
6. 建筑细节、人物、绿化和装饰。

# 一、参考图权限

- 图一：唯一的构图、版式、品牌爱心母模与品牌模块标准。决定相机透视、主体位置、爱心几何结构、内部白色品牌图形、台座、标题以及三个品牌模块。黑色圆圈数字仅为分区说明，最终必须删除。
- 图二：系列风格样本板。参考其商业3D建模语言、材质精度、空间层次、灯光品质、色彩组织与KV完成度。不得参考或复制其居中构图、具体内容、标题、Logo、角标、搜索框、人物活动和单张配色。
- 图三：城市爱心外观方向候选板。只参考与任务标题、视觉氛围及最终场景相适合的材质、工艺、配色、二维纹样、表面分区和浅表处理；不得复制任何完整方案，也不得参考其外部剪影、宽高比例、厚度、顶部关系、底部弧线、边缘曲率、朝向和白色品牌图形。
- 图四：只参考九个城市元素的造型与识别特征。不得参考3×3排版、白色背景和独立方块底座。

发生冲突时，图一拥有绝对优先权；图二、图三、图四均无权改变图一的构图、爱心结构和品牌模块。

# 二、固定构图与安全区

画布左上角为\`(0%, 0%)\`，右下角为\`(100%, 100%)\`，以下位置允许约±2%的误差。

## 1. 品牌爱心

固定外框：X 14%–48%，Y 10%–64%。

- 爱心整体必须完整位于画面左半区，右边缘不得跨过X 50%的画面中线。
- 视觉中心、大小、朝向、透视和画面占比严格遵循图一。
- 不得因建筑、标题或视觉平衡而移动、缩放、旋转或改成居中展示。

## 2. 爱心台座

固定外框：X 22%–50%，Y 62%–83%。

- 位于爱心正下方，保持图一的双层圆形结构、整体尺寸和承托关系。
- 台座中心仍处于左半区，不得移到画面中心，不得扩建为中央舞台、喷泉、阶梯广场或大型纪念碑基座。
- 材质、色彩和浅表纹样可以响应任务标题与视觉氛围，但不能改变结构和位置。

## 3. 任务标题

固定外框：X 50%–96%，Y 10%–32%。

- 准确呈现任务标题全部字符，不得错字、漏字、换行、替换或裁切。
- 位置、外框、倾斜方向、字距、粗细和透视感参考图一，使用高对比白色粗体。
- 标题必须在右上区域，不得居中、下移或为了避让建筑改变位置。
- 字数变化时，只允许在固定外框内调整字号和字距。

## 4. 场景结构

- 天空与简洁远景主要位于Y 0%–52%，地平线约在Y 45%，连续广场地面主要位于Y 52%–100%。
- 保持图一约28mm广角透视与小幅俯视，形成连续、可行走的完整空间。
- 画面中心区域用于空间过渡、城市元素与适量留白，不得放置另一个大型爱心、主舞台或新中心主体。
- 禁止鸟瞰、航拍、桌面沙盘、正面轴对称和九个模型并排陈列。

# 三、品牌爱心母模锁定

图一中的爱心是不可重新设计的固定3D品牌母模。最终效果应像把同一个标准3D模型放进新场景，只更换表面城市化设计。

必须保持图一中的：

- 不对称外部剪影。
- 宽阔、饱满、圆润的底部弧线。
- 宽高比例、整体厚度、顶部高低关系和边缘曲率。
- 正面朝向、透视角度、视觉中心和画面占比。
- 实心、完整、连续的主体体块。

所有材质、纹样和工艺必须收纳在图一的固定外形包络内。禁止重新雕塑母模，禁止拉长、压扁、旋转、镜像、改变顶部关系或修改底部弧线；不得变成常规对称尖底爱心、空心线框爱心、霓虹轮廓爱心、透明框架或建筑形爱心。底部不得出现尖端、折角或尖锐收口。

如果某个城市化创意无法装入固定母模，应简化或放弃该创意，不得改变爱心结构。

## 图三的正确使用方式

- 先根据任务标题、视觉氛围与最终场景选择一个清晰的城市化方向，再从图三借鉴适合的材质、工艺、配色、二维纹样、表面分区或浅表处理。
- 图三只提供倾向，不要求照搬其中任何一款，也不得把多款方案无序混合。
- 允许使用不改变母模几何结构的织造、刺绣、釉面、漆面、印花、浅浮雕、浅凹刻、镶嵌、贴合曲面的分区、透光表层和材质纹理。
- 禁止使用会改变主体剪影或整体厚度的镂空、外接骨架、突出构件、大型筋条、深层切割、多层外壳和结构重组。
- 爱心表面使用抽象化的文化纹样、材料和灯光语言，不完整复制图四中的九个城市元素，避免与背景重复。

## 环境适配范围

- 最终场景可以影响爱心的材质、配色、二维纹样、浅表工艺、透明度、发光方式、受光、反射和高光。
- 最终场景不得影响爱心的剪影、宽高比例、厚度、顶部关系、底部弧线、边缘曲率、朝向和位置。
- 爱心与环境共享统一的光源、反射、阴影和材质精度，同时保持清晰轮廓与第一视觉焦点地位。

## 内部白色品牌图形

爱心内部的白色图形是图一中的自定义J形曲线品牌图形，以图一为唯一几何标准。它不是抖音或TikTok音符，不是音乐符号，也不是左上、左下品牌模块里的抖音图标。

- 保持图一中的几何结构、倾斜方向、大小、位置、比例和与爱心边界的相对关系。
- 禁止替换为抖音音符、TikTok音符、双音符或任何音乐图标。
- 禁止青色与红色错位描边、glitch故障效果、霓虹音符效果、双层重影和品牌Logo自动补全。
- 白色图形与爱心主体同步连续成型，只能随固定曲面和透视自然贴合，不得独立旋转、自动扶正、翻转、镜像、缩放、移动或重新绘制。
- 它应使用与主体一致的制作逻辑：织物中为同一织造或刺绣区域，陶瓷中为连续釉面，木石中为同体雕刻或留白，金属、玻璃或发光材质中为同一结构内部的白色表面或透光区域。
- 保持白色或接近白色，边界完整清楚，在缩略图下仍可快速识别。
- 不得出现独立厚度、凸起边板、外包边、缝隙、悬浮距离或独立投影；不得表现为塑料片、外贴标牌或粘贴零件。

# 四、固定品牌模块

以下三个模块是最终KV的固定叠加内容，直接参考图一相应区域保留：

- 左上品牌区：X 2.5%–21%，Y 4%–11%。完整保留图一对应区域的白色组合标识。
- 左下品牌区：X 2.5%–21%，Y 86%–97%。完整保留图一对应区域的白色组合标识与品牌口号。
- 右下搜索框：X 72%–97.5%，Y 89%–96%。保留图一的圆角搜索框结构、左侧固定文字和右侧搜索图标；搜索关键词使用任务标题，不得保留占位文字。

三个模块必须完整、清晰、高对比，不得变形、裁切、移动或被遮挡。除任务标题和图一三个品牌模块中的既有内容外，不得新增其他Logo、宣传文字、角标、定位标签、招牌或乱码。

# 五、城市元素

图四中的九个元素必须全部出现，每个只出现一次。

- 去除原有白色方块底座，保留各自最具代表性的轮廓与识别特征。
- 融入同一个连续的广场与中后景城市空间，不得遗漏、合并、重复或完全遮挡。
- 具体位置、大小、前后关系和组合节奏可以变化，但必须服从图一构图，不得侵入爱心、台座、标题与品牌模块的固定区域。
- 九个元素使用统一透视、建模、材质、光源和空气层次，不得像独立模型拼贴。
- 不新增大量可识别地标或密集天际线。建筑立面不得生成额外文字、错误招牌或乱码。

空间不足时，依次简化建筑细节、缩小中后景建筑、减少人物与装饰、增加前后层次；不得移动固定主体或改成中心构图。

# 六、画面风格与视觉氛围

图二只用于定义统一系列风格：以干净、清爽、圆润的3D建模小场景为基础，通过明确的大体块、克制的细节和合理色彩关系形成商业KV质感。

## 色彩逻辑

- 视觉氛围只决定主色倾向、时间、天气、环境光与整体情绪，不等于给全画面叠加单色滤镜。
- 使用"环境主氛围色＋场景自然色＋焦点对比色"的结构。主氛围色统一画面，天空、地面、水体、建筑、人物和植物仍保留合理自身颜色与明暗层次。
- 使用约3–5组协调颜色，允许同类色、邻近色和少量对比色共同存在；避免单一色相灌满，也避免杂乱彩虹配色。
- 品牌爱心必须通过色相、明度或饱和度与背景形成清晰对比，不得与环境融为一体；内部白色品牌图形保持高对比。
- 标题和三个品牌模块保持白色或接近纯白，不受环境色严重染色。
- 使用色温、明暗和饱和度区分前、中、远景；禁止整体偏色、荧光色泛滥和过重滤镜。

## 构成与细节密度

- 使用高品质、风格化、明显非摄影的商业3D建模；所有元素保持统一的建模语言、材质精度与光照方向。
- 爱心、台座、标题和图四九个元素是主要信息，不依靠新增大量建筑、植被、人物、装置和微纹理制造丰富度。
- 九个元素采用清晰的中大型体块，保持适当间距；广场保留连续、干净的地面和适量留白，使左侧爱心、右上标题及品牌模块周围有呼吸感。
- 建筑保留代表性轮廓，适度概括门窗与结构；使用柔和倒角、圆润边缘和整洁材质面。
- 人物仅作尺度参照，少量分散出现；植被少量成组点缀，不形成密集树林或覆盖建筑的繁殖感。
- 装饰光、烟花、花瓣、灯笼、粒子、反射和光晕应克制，同类装饰只保留一种主要表达。
- 材质明亮、干净、精致，可有适量光泽、反射、透光和纹理；避免破旧污渍、颗粒噪点、复杂微纹理和廉价塑料感。
- 允许轻微景深与氛围光，但固定主体、标题、品牌模块和九个元素必须清晰可辨。

禁止四宫格、分屏、拼贴、真实摄影、照片级写实、中心纪念碑构图、正面对称广场、桌面沙盘、低幼卡通、过度低模，以及密集建筑、窗户、植被、人物、装饰和纹理堆叠。

# 七、生成前检查

生成前依次确认：

1. 是否复现图一的左侧爱心、右上标题非对称构图，而非居中构图。
2. 爱心是否完整位于X 14%–48%，没有跨过画面中线。
3. 爱心是否保持图一母模的不对称剪影、圆润底部、比例、厚度、顶部关系和朝向。
4. 内部白色图形是否保持图一的自定义J形结构，且没有变成抖音/TikTok音符或glitch标志。
5. 台座、标题和三个品牌模块是否位于固定区域并完整清晰。
6. 图四九个城市元素是否全部出现、各一次、无独立白色底座，并融入统一空间。
7. 图三是否只影响爱心表面城市化设计，没有改变母模结构。
8. 画面是否响应任务标题与视觉氛围，同时保持合理配色、克制细节和清爽3D场景。
9. 图一黑色圆圈数字及所有标注、箭头、网格和辅助线是否全部删除。

发生冲突时，首先保留图一的构图、爱心母模与自定义白色品牌图形；其次保留台座、标题、品牌模块和九个城市元素；最后简化材质创意、建筑细节、人物、绿化和装饰。
`;

const DEFAULT_LANDMARKS = `1. 雷峰塔
2. 断桥
3. 三潭印月
4. 杭州奥体中心
5. 拱宸桥
6. 城隍阁
7. 杭州国际会议中心
8. 六和塔
9. 灵隐寺`;

const DEFAULT_SUGGEST_PROMPT =
  "帮我寻找{{城市}}的九个代表性元素，顿号隔开，不要补充说明。";

const DEFAULT_GENERATE_PROMPT =
  "帮我将这九个元素替换为{{城市}}的这些标志元素：{{标志元素}}";

const DEFAULT_HEART_PROMPT = `
城市主题词：「{{城市}}｜{{标志元素}}」

# 生成任务

以图一的品牌主体为固定母模，围绕"城市主题词"设计9款城市化实体外观，并以3×3网格展示。

这不是重新设计品牌造型，也不是复刻图二中的现成方案。

创意优先级：

1. 图一的品牌结构。
2. 城市主题词。
3. 明亮、亲和的品牌色彩。
4. 图二提供的变化幅度与实体化方法。

输出1:1正方形画面，使用纯白或极浅灰色摄影棚背景。

# 一、图一：固定品牌母模

九款必须像复制同一个3D模型一样，保持图一中的：

- 不对称外部剪影。
- 宽阔、饱满、圆润的底部弧线。
- 宽高比例、厚度、顶部关系和边缘曲率。
- 正面朝向、透视角度和画面占比。
- 白色品牌图形的结构、方向、大小和相对位置。

所有材质、构件和工艺都必须收纳在图一的固定外形包络内。

禁止重新雕塑母模，禁止改成常规对称尖底造型，禁止拉长、压扁、旋转或改变顶部关系；底部不得出现尖端、折角或尖锐收口。

如果某个创意无法装入图一的固定剪影，应简化或放弃该创意，不得修改母模。

## 白色品牌图形

白色品牌图形与主体是同步成型、不可拆分的品牌整体。

九款都必须保持图一中的：

- 几何结构和倾斜方向。
- 大小、位置和比例。
- 与主体边界的相对关系。

九款主体采用相同朝向，因此白色图形在九格中的视觉方向也必须一致。

白色图形可以随主体表面曲率和透视自然贴合，但不得相对主体独立旋转、自动扶正、翻转、镜像、缩放、移动或重新绘制。

白色图形必须采用与主体一致的制作逻辑：

- 织物主体中，它是同一织造或刺绣系统形成的白色区域。
- 陶瓷主体中，它是与器身连续成型的白色釉面区域。
- 木石主体中，它是从同一整体材料形成的白色雕刻或留白区域。
- 金属、玻璃或发光主体中，它是同一结构内部形成的白色表面或透光区域。

无论采用何种工艺，白色图形都必须：

- 顺应主体连续曲面。
- 共享相同光照、反射和材质精度。
- 保持白色或接近白色。
- 边界完整、清楚，在缩略图下仍能快速识别。
- 可以继承主体的细微材质纹理，但不能影响识别。

不得出现独立厚度、凸起边板、包边、缝隙、悬浮距离或独立投影；不得表现为塑料片、外贴标牌或粘在表面的白色零件。

目标是：品牌图形清晰可辨，但在结构、曲率、材质和光影上与主体自然一体。

# 二、图二：仅参考设计方法

图二不是造型素材库，只用于理解：

> 同一个固定品牌母模，可以通过实体材料、制作工艺和内部构造产生显著不同的设计。

只参考图二的：

- 方案之间的差异幅度。
- 实体化程度。
- 材质与构造的丰富性。
- 同一品牌主体形成系列探索的方法。

不得从图二直接提取或复刻任何具体物件、材质配色、纹样、构件布局或现成组合。

图二不能决定九款"生成什么"，只能帮助九款"做得更实体、更丰富"。

如果某个方案只能由图二解释，却无法由"城市主题词"解释，则该方案无效。

# 三、城市主题必须主导创意

生成前，先暂时忽略图二的具体内容，仅根据"城市主题词"在内部规划9款方案。每款分别确定：

- 一个城市关键词或城市特征。
- 一个由该特征推导出的实体原型。
- 一种制作工艺或结构逻辑。
- 一种主要材质。
- 一套明亮配色。

规划完成后，图二只能用于提高实体化程度，不得改变已经由城市主题确定的创意方向。

要求：

- 九款都必须能够追溯到"城市主题词"。
- 至少使用6个不同的城市关键词或城市特征。
- 至少5款从实体结构、制作工艺或材料关系上体现城市。
- 每款只有一个清晰的主导概念，避免多个城市符号堆叠。
- 删除图二后，九款创意仍应成立并具有城市辨识度。

城市特征可以转译为：

- 地方器物与生活方式。
- 传统工艺与制作结构。
- 建筑构件与材料关系。
- 自然生态与有机形态。
- 当代城市材质与公共艺术语言。

不得直接粘贴完整地标、人物、美食、文字或城市图标。

# 四、实体外观差异

九款不能只在相同表面更换颜色或印花。

在固定母模内，可以改变：

- 内部体块和表面起伏。
- 拼片、分区、骨架、筋条和层叠结构。
- 编织、绳束、包裹和重复构件。
- 包边、缝线、铆钉、榫接、镶嵌和拼接方式。
- 浮雕、凹刻、镂刻、压纹和浅内嵌。
- 陶瓷、玉石、金属、织物、竹木、玻璃等真实制作逻辑。
- 透明、半透明、透光和多层材料关系。

方案要求：

- 至少5款具有明显不同的实体构造。
- 至少使用6种不同的主体材质或制作工艺。
- 平面印花或简单换色方案最多2款。
- 九款不得重复同一种实体原型。
- 所有结构变化不得突破图一的固定剪影。

# 五、品牌色彩

九款整体必须明亮、轻快、鲜活。

- 至少4款以朱红、珊瑚红、橙红、绯红等明亮红色相为主体主色。
- 至少3款红色方案具有不同的实体构造。
- 其余方案可使用明亮绿色、青绿、湖蓝、浅金、象牙白、粉色、桃色或淡紫。
- 所有大面积主色保持中高明度。

禁止将黑色、深灰、藏青、深紫、深棕、墨绿、暗酒红及其他低明度颜色作为主体主色。

暗色只可用于少量缝隙、轮廓和体积阴影，不得令主体发黑、脏暗或沉重。

# 六、无底台与版式

- 标准3×3网格，每格只展示一个主体。
- 九款保持相同观察角度、近似大小和统一光照。
- 每款完整入画、独立悬浮、互不遮挡、留白均匀。
- 不生成底台、底座、平台、支架、立柱或承托结构。
- 可以保留轻微悬浮阴影，但不能形成实体平台。
- 使用高品质、圆润、精致的3D产品设计渲染。
- 不生成网格线、边框、标题、编号、标签、文字或水印。

# 最终检查

逐款确认：

1. 是否保持图一的不对称剪影和圆润底部。
2. 白色品牌图形是否保持正确结构、方向、大小和位置。
3. 白色图形是否与主体连续成型，而不是独立贴片。
4. 九款创意是否都来自城市主题词，而不是复刻图二。
5. 是否至少使用6个不同城市特征。
6. 是否至少5款具有城市化实体构造。
7. 平面印花或简单换色是否不超过2款。
8. 是否至少4款为明亮红色主体。
9. 是否没有深色主体、底台和支架。

发生冲突时，优先保证图一品牌结构和白色品牌图形，其次保证城市主题，再考虑图二提供的变化方法。
`;

function parseLandmarks(text: string): string[] {
  return text
    .split(/[、\n]/)
    .map((line) => line.replace(/^\d+\.\s*/, "").trim())
    .filter(Boolean);
}

function renderInlineMd(text: string): string {
  return escapeHtml(text).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function renderMarkdownToHtml(text: string): string {
  return text
    .split(/\n\n+/)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";
      if (trimmed.startsWith("## ")) {
        return `<h3 class="md-h3">${renderInlineMd(trimmed.slice(3))}</h3>`;
      }
      if (trimmed.startsWith("# ")) {
        return `<h2 class="md-h2">${renderInlineMd(trimmed.slice(2))}</h2>`;
      }
      if (trimmed.startsWith("> ")) {
        return `<blockquote class="md-blockquote">${renderInlineMd(trimmed.slice(2))}</blockquote>`;
      }
      if (trimmed.startsWith("- ")) {
        return `<div class="md-li"><span class="md-bullet">•</span><span>${renderInlineMd(trimmed.slice(2))}</span></div>`;
      }
      return `<p class="md-p">${renderInlineMd(trimmed.replace(/\n/g, "<br>"))}</p>`;
    })
    .join("");
}

function getInlineText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
  if (!(node instanceof HTMLElement)) return node.textContent || "";
  const content = Array.from(node.childNodes).map(getInlineText).join("");
  return node.tagName === "STRONG" || node.tagName === "B"
    ? `**${content}**`
    : content;
}

function htmlToMarkdown(root: HTMLElement): string {
  return Array.from(root.childNodes)
    .map((node) => {
      if (node instanceof HTMLElement && node.classList.contains("cli-resolved")) {
        return `{{${node.dataset.ph || ""}}}`;
      }
      if (node instanceof HTMLElement) {
        if (node.tagName === "H2") return `# ${getInlineText(node)}`;
        if (node.tagName === "H3") return `## ${getInlineText(node)}`;
        if (node.tagName === "BLOCKQUOTE") return `> ${getInlineText(node)}`;
        if (node.classList.contains("md-li")) {
          const span = node.querySelector("span:last-child");
          return `- ${span ? getInlineText(span) : ""}`;
        }
        if (node.tagName === "P") return getInlineText(node);
        if (node.tagName === "DIV" || node.tagName === "BR") return "";
      }
      return node.textContent || "";
    })
    .filter(Boolean)
    .join("\n\n");
}

function formatLandmarks(items: string[]): string {
  return items.map((name, i) => `${i + 1}. ${name}`).join("\n");
}

function MarkdownPromptEditor({
  template,
  placeholders,
  onChange,
  ariaLabel,
}: {
  template: string;
  placeholders: Record<string, string>;
  onChange: (raw: string) => void;
  ariaLabel: string;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const internalRef = useRef(false);

  const placeholderKeys = useMemo(
    () => Object.keys(placeholders),
    [placeholders],
  );

  /* Build the resolved HTML from the template */
  const buildHtml = useCallback(
    (tmpl: string) => {
      let html = tmpl
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
      for (const key of placeholderKeys) {
        const resolved = placeholders[key] || "";
        html = html.replaceAll(
          key,
          `<span class="resolved-placeholder" contenteditable="false" data-ph="${key}">${resolved.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</span>`,
        );
      }
      return html.replace(/\n/g, "<br>");
    },
    [placeholderKeys, placeholders],
  );

  /* Render the resolved HTML into the contentEditable div */
  useEffect(() => {
    if (!editorRef.current || internalRef.current) return;
    const sel = saveSelection(editorRef.current);
    editorRef.current.innerHTML = buildHtml(template);
    restoreSelection(editorRef.current, sel);
  }, [template, buildHtml]);

  /* Extract the raw template from the contentEditable div */
  const extractTemplate = useCallback((): string => {
    if (!editorRef.current) return template;
    const parts: string[] = [];
    const walk = (node: Node) => {
      if (node instanceof HTMLElement) {
        if (node.classList.contains("resolved-placeholder")) {
          parts.push(node.dataset.ph || "");
          return;
        }
        if (node.tagName === "BR") {
          parts.push("\n");
          return;
        }
        if (node.tagName === "DIV") {
          node.childNodes.forEach(walk);
          parts.push("\n");
          return;
        }
      }
      if (node.nodeType === Node.TEXT_NODE) {
        parts.push(node.textContent || "");
      } else if (node instanceof HTMLElement) {
        node.childNodes.forEach(walk);
      }
    };
    editorRef.current.childNodes.forEach(walk);
    return parts.join("").replace(/\n+$/, "");
  }, [template]);

  const handleInput = useCallback(() => {
    internalRef.current = true;
    onChange(extractTemplate());
    setTimeout(() => {
      internalRef.current = false;
    }, 0);
  }, [onChange, extractTemplate]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "b") {
        e.preventDefault();
        wrapSelection(editorRef.current, "**");
        handleInput();
      } else if (mod && e.key === "i") {
        e.preventDefault();
        wrapSelection(editorRef.current, "*");
        handleInput();
      } else if (e.key === "Tab") {
        e.preventDefault();
        document.execCommand("insertText", false, "  ");
      }
    },
    [handleInput],
  );

  return (
    <div
      ref={editorRef}
      className="landmark-cli-textarea"
      contentEditable
      suppressContentEditableWarning
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      role="textbox"
      aria-label={ariaLabel}
      spellCheck={false}
    />
  );
}

function wrapSelection(container: HTMLElement | null, wrapper: string) {
  if (!container) return;
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  if (range.collapsed) return;
  const text = range.toString();
  if (!text) return;
  const before = document.createTextNode(wrapper);
  const after = document.createTextNode(wrapper);
  range.deleteContents();
  range.insertNode(after);
  range.insertNode(before);
  const newRange = document.createRange();
  newRange.setStartAfter(before);
  newRange.setEndAfter(before);
  newRange.setEnd(after, 0);
  sel.removeAllRanges();
  sel.addRange(newRange);
}

function saveSelection(container: HTMLElement) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;
  return {
    startContainer: range.startContainer,
    startOffset: range.startOffset,
    endContainer: range.endContainer,
    endOffset: range.endOffset,
  };
}

function restoreSelection(
  container: HTMLElement,
  saved: ReturnType<typeof saveSelection>,
) {
  if (!saved) return;
  try {
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.setStart(saved.startContainer, saved.startOffset);
    range.setEnd(saved.endContainer, saved.endOffset);
    sel.removeAllRanges();
    sel.addRange(range);
  } catch {
    /* ignore invalid ranges */
  }
}

type ReferenceCategory = string;

type ReferenceItem = {
  id: string;
  field: string;
  label: string;
  category: ReferenceCategory;
  src: string;
  filename: string;
  file?: File;
};

type ProgressEvent = {
  at?: string | number;
  message: string;
};

type ResultItem = {
  id: string;
  url: string;
  prompt: string;
  createdAt: number;
};

type ServicePhase = "checking" | "online" | "offline";

const INITIAL_REFERENCES: ReferenceItem[] = [
  {
    id: "layout",
    field: "layout",
    label: "1_layout",
    category: "KV REF",
    src: "/references/1_layout.webp",
    filename: "1_layout.webp",
  },
  {
    id: "kv-ref",
    field: "kv_ref_1",
    label: "2_ref",
    category: "KV REF",
    src: "/references/2_ref.webp",
    filename: "2_ref.webp",
  },
  {
    id: "heart",
    field: "heart",
    label: "3_heart",
    category: "KV REF",
    src: "/references/3_heart.webp",
    filename: "3_heart.webp",
  },
  {
    id: "landmark",
    field: "city_landmark",
    label: "4_landmark",
    category: "CITY LANDMARK",
    src: "/references/4_landmark.webp",
    filename: "4_landmark.webp",
  },
];

async function readApiResponse<T extends { error?: string }>(
  response: Response,
): Promise<T> {
  const text = await response.text();
  if (!text) return {} as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    const error =
      response.status === 413
        ? "参考图总大小超过服务上限，请压缩图片后重试。"
        : text.trim() || `服务返回了无法解析的响应（HTTP ${response.status}）`;
    return { error } as T;
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export default function Home() {
  const [references, setReferences] =
    useState<ReferenceItem[]>(INITIAL_REFERENCES);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [city, setCity] = useState("杭州");
  const [activityTitle, setActivityTitle] = useState("心动杭州");
  const [landmarks, setLandmarks] = useState<string[]>(
    parseLandmarks(DEFAULT_LANDMARKS),
  );
  const [landmarkAction, setLandmarkAction] = useState<
    "suggest" | "generate" | "heart" | null
  >(null);
  const [landmarkMessage, setLandmarkMessage] = useState("");
  const [suggestPrompt, setSuggestPrompt] = useState(DEFAULT_SUGGEST_PROMPT);
  const [generatePrompt, setGeneratePrompt] = useState(
    DEFAULT_GENERATE_PROMPT,
  );
  const [heartPrompt, setHeartPrompt] = useState(DEFAULT_HEART_PROMPT);
  const [atmosphere, setAtmosphere] = useState("晴天");
  const [cliCollapsed, setCliCollapsed] = useState(true);
  const [cliSuggestCollapsed, setCliSuggestCollapsed] = useState(true);
  const [cliGenerateCollapsed, setCliGenerateCollapsed] = useState(true);
  const [cliHeartCollapsed, setCliHeartCollapsed] = useState(true);
  const [results, setResults] = useState<ResultItem[]>([]);
  const [selectedResult, setSelectedResult] = useState(0);
  const landmarkRef = useMemo(
    () => references.find((r) => r.field === "city_landmark")!,
    [references],
  );
  const kvRefs = useMemo(
    () => references.filter((r) => r.field !== "city_landmark" && r.field !== "heart"),
    [references],
  );
  const heartRef = useMemo(
    () => references.find((r) => r.field === "heart")!,
    [references],
  );
  const [selectedComposition, setSelectedComposition] = useState(0);
  const compositionRefs = useMemo(() => {
    const layoutRef = references.find((r) => r.field === "layout")!;
    const kvRef1 = references.find((r) => r.field === "kv_ref_1")!;
    return [
      { enabled: true, images: [layoutRef, kvRef1] },
      { enabled: false, images: [null, null] as (ReferenceItem | null)[] },
      { enabled: false, images: [null, null] as (ReferenceItem | null)[] },
    ];
  }, [references]);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [previewReference, setPreviewReference] =
    useState<ReferenceItem | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [events, setEvents] = useState<ProgressEvent[]>([]);
  const [error, setError] = useState("");
  const [servicePhase, setServicePhase] = useState<ServicePhase>("checking");
  const [serviceError, setServiceError] = useState("");
  const [newLandmark, setNewLandmark] = useState("");
  const [addingLandmark, setAddingLandmark] = useState(false);
  const newLandmarkRef = useRef<HTMLInputElement | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const resolvedPrompt = useMemo(
    () =>
      prompt
        .replaceAll("{{城市}}", city.trim() || "未填写城市")
        .replaceAll("{{活动名称}}", activityTitle.trim() || "未填写活动名称")
        .replaceAll("{{活动标题}}", activityTitle.trim() || "未填写活动标题")
        .replaceAll("{{氛围}}", atmosphere.trim() || "晴天"),
    [activityTitle, city, prompt, atmosphere],
  );
  const landmarksText = useMemo(
    () => landmarks.join("、"),
    [landmarks],
  );
  const landmarkPlaceholders = useMemo(
    () => ({
      "{{城市}}": city.trim() || "未填写",
      "{{标志元素}}": landmarksText || "未填写",
    }),
    [city, landmarksText],
  );
  const promptPlaceholders = useMemo(
    () => ({
      "{{城市}}": city.trim() || "未填写",
      "{{活动名称}}": activityTitle.trim() || "未填写",
      "{{活动标题}}": activityTitle.trim() || "未填写",
      "{{氛围}}": atmosphere.trim() || "晴天",
    }),
    [city, activityTitle, atmosphere],
  );
  const activeResult = results[selectedResult];

  useEffect(() => {
    let active = true;
    fetch("/api/health", { cache: "no-store" })
      .then(async (response) => ({
        response,
        payload: await readApiResponse<{ ok?: boolean; error?: string }>(response),
      }))
      .then(({ response, payload }) => {
        if (!active) return;
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || "Gemini API 密钥无效或网络不可达");
        }
        setServicePhase("online");
        setServiceError("");
      })
      .catch((caughtError) => {
        if (!active) return;
        setServicePhase("offline");
        setServiceError(
          caughtError instanceof Error
            ? caughtError.message
            : "Gemini API 密钥无效或网络不可达",
        );
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!lightboxOpen && !previewReference) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLightboxOpen(false);
        setPreviewReference(null);
      }
      if (lightboxOpen && event.key === "ArrowLeft") {
        setSelectedResult((current) =>
          results.length ? (current - 1 + results.length) % results.length : 0,
        );
      }
      if (lightboxOpen && event.key === "ArrowRight") {
        setSelectedResult((current) =>
          results.length ? (current + 1) % results.length : 0,
        );
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxOpen, previewReference, results.length]);

  const replaceReference = async (
    item: ReferenceItem,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("请选择 PNG、JPEG 或 WebP 图片。");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("单张参考图不能超过 10MB。");
      return;
    }

    setError("");
    const compressed = await compressImage(file);
    const src = URL.createObjectURL(compressed);
    setReferences((current) =>
      current.map((reference) => {
        if (reference.id !== item.id) return reference;
        if (reference.file && reference.src.startsWith("blob:")) {
          URL.revokeObjectURL(reference.src);
        }
        return { ...reference, file: compressed, src, filename: compressed.name };
      }),
    );
    event.target.value = "";
  };

  const appendReferenceFiles = useCallback(
    async (formData: FormData) => {
      for (const reference of references) {
        // 仅上传用户替换过的图片，默认参考图由服务端直接从磁盘加载
        if (reference.file) {
          formData.append(reference.field, reference.file, reference.filename);
        }
      }
    },
    [references],
  );

  const suggestLandmarks = async () => {
    if (landmarkAction) return;
    if (!city.trim()) {
      setLandmarkMessage("请先填写活动城市。");
      return;
    }
    setLandmarkAction("suggest");
    setLandmarkMessage(`正在通过 Gemini 寻找${city.trim()}的九个代表性元素…`);
    try {
      const resolvedSuggest = suggestPrompt.replaceAll("{{城市}}", city.trim());
      const response = await fetch("/api/landmarks/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city: city.trim(),
          prompt: resolvedSuggest,
        }),
      });
      const payload = await readApiResponse<{ resultText?: string; error?: string }>(
        response,
      );
      if (!response.ok) {
        throw new Error(payload.error || "无法提交元素推荐任务");
      }
      if (!payload.resultText) {
        throw new Error("Gemini 未返回元素推荐结果");
      }
      setLandmarks(parseLandmarks(payload.resultText));
      setLandmarkMessage("已更新城市标志元素。");
    } catch (caughtError) {
      setLandmarkMessage(
        caughtError instanceof Error ? caughtError.message : "元素推荐失败",
      );
    } finally {
      setLandmarkAction(null);
    }
  };

  const generateLandmarkImage = async () => {
    if (landmarkAction) return;
    if (!city.trim() || !landmarks.length) {
      setLandmarkMessage("请先填写活动城市和标志元素。");
      return;
    }
    const landmarkReference = references.find(
      (reference) => reference.field === "city_landmark",
    );
    if (!landmarkReference) {
      setLandmarkMessage("未找到城市标志参考图。");
      return;
    }

    setLandmarkAction("generate");

    /* Step 1: text-to-text — detail each element */
    setLandmarkMessage("正在通过 Gemini 分析标志元素特征…");
    try {
      const detailPrompt = `给${landmarks.join("、")}里的每个元素，补充建筑的风格、颜色、特征说明，每个元素的格式按照如下返回，序号递增
1. 元素名称
* 风格：
* 颜色：
* 特征：`;
      const detailResponse = await fetch("/api/landmarks/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city: city.trim(),
          prompt: detailPrompt,
        }),
      });
      const detailPayload = await readApiResponse<{ resultText?: string; error?: string }>(
        detailResponse,
      );
      if (!detailResponse.ok) {
        throw new Error(detailPayload.error || "无法提交元素特征分析任务");
      }
      if (!detailPayload.resultText) {
        throw new Error("Gemini 未返回元素特征分析结果");
      }
      const elementDetails = detailPayload.resultText.trim();

      /* Step 2: image-to-image — generate with reference */
      setLandmarkMessage("正在通过 Gemini 生成城市标志元素图片…");
      let file = landmarkReference.file;
      if (!file) {
        const sourceResponse = await fetch(landmarkReference.src);
        if (!sourceResponse.ok) throw new Error("无法读取城市标志参考图");
        const blob = await sourceResponse.blob();
        file = new File([blob], landmarkReference.filename, {
          type: blob.type || "image/png",
        });
      }

      const formData = new FormData();
      formData.append("city", city.trim());
      formData.append("landmarks", formatLandmarks(landmarks));
      formData.append(
        "prompt",
        `帮我将这九个元素替换为以下元素${elementDetails}`,
      );
      formData.append("model", "gemini-3-pro-image");
      formData.append("file", file, file.name);
      const imgResponse = await fetch("/api/landmarks/generate", {
        method: "POST",
        body: formData,
      });
      const imgPayload = await readApiResponse<{
        image?: { mimeType: string; data: string };
        error?: string;
      }>(imgResponse);
      if (!imgResponse.ok) {
        throw new Error(imgPayload.error || "无法提交标志元素图片任务");
      }
      const genImage = imgPayload.image;
      if (!genImage?.data) {
        throw new Error("Gemini 未返回标志元素图片");
      }

      setReferences((current) =>
        current.map((reference) => {
          if (reference.field !== "city_landmark") return reference;
          if (reference.file && reference.src.startsWith("blob:")) {
            URL.revokeObjectURL(reference.src);
          }
          return {
            ...reference,
            file: undefined,
            src: genImage.data,
            filename: "4_landmark.png",
          };
        }),
      );
      setLandmarkMessage("城市标志元素图片已生成并替换参考图。");
    } catch (caughtError) {
      setLandmarkMessage(
        caughtError instanceof Error ? caughtError.message : "标志元素图片生成失败",
      );
    } finally {
      setLandmarkAction(null);
    }
  };

  const generateHeartImage = async () => {
    if (landmarkAction) return;
    if (!city.trim()) {
      setLandmarkMessage("请先填写活动城市。");
      return;
    }
    const heartReference = references.find(
      (reference) => reference.field === "heart",
    );
    if (!heartReference) {
      setLandmarkMessage("未找到爱心参考图。");
      return;
    }
    setLandmarkAction("heart");
    setLandmarkMessage("正在通过 Gemini 生成城市爱心…");
    try {
      const resolvedHeart = heartPrompt
        .replaceAll("{{城市}}", city.trim())
        .replaceAll("{{标志元素}}", landmarks.join("、"));
      const formData = new FormData();
      formData.append("prompt", resolvedHeart);
      formData.append("model", "gemini-3-pro-image");
      formData.append("count", "1");
      formData.append("aspect_ratio", "1:1");
      formData.append("image_size", "1K");
      // 发送爱心参考图
      let file = heartReference.file;
      if (!file) {
        const sourceResponse = await fetch(heartReference.src);
        if (!sourceResponse.ok) throw new Error("无法读取爱心参考图");
        const blob = await sourceResponse.blob();
        file = new File([blob], heartReference.filename, {
          type: blob.type || "image/png",
        });
      }
      formData.append("heart", file, file.name);
      // 也发送 KV 参考图
      const kvRef = references.find((r) => r.field === "kv_ref_1");
      if (kvRef) {
        let kvFile = kvRef.file;
        if (!kvFile) {
          const kvResp = await fetch(kvRef.src);
          if (kvResp.ok) {
            const kvBlob = await kvResp.blob();
            kvFile = new File([kvBlob], kvRef.filename, { type: kvBlob.type || "image/png" });
          }
        }
        if (kvFile) formData.append("kv_ref_1", kvFile, kvFile.name);
      }

      const response = await fetch("/api/generate", {
        method: "POST",
        body: formData,
      });
      const payload = await readApiResponse<{
        images?: Array<{ mimeType: string; data: string }>;
        error?: string;
      }>(response);
      if (!response.ok) {
        throw new Error(payload.error || "城市爱心生成失败");
      }
      const images = payload.images;
      if (!images?.length) {
        throw new Error("Gemini 未返回城市爱心图片");
      }
      // 替换爱心参考图
      setReferences((current) =>
        current.map((reference) => {
          if (reference.field !== "heart") return reference;
          if (reference.file && reference.src.startsWith("blob:")) {
            URL.revokeObjectURL(reference.src);
          }
          return {
            ...reference,
            file: null,
            src: images[0].data,
            filename: "heart-generated.png",
          };
        }),
      );
      setLandmarkMessage("城市爱心图片已生成并替换参考图。");
    } catch (caughtError) {
      setLandmarkMessage(
        caughtError instanceof Error ? caughtError.message : "城市爱心生成失败",
      );
    } finally {
      setLandmarkAction(null);
    }
  };

  const handleGenerate = async () => {
    if (isGenerating) return;
    if (servicePhase !== "online") {
      setServiceError("Gemini API 尚未就绪，请检查 API Key 配置。");
      return;
    }
    setIsGenerating(true);
    setError("");
    setEvents([{ at: Date.now(), message: "正在准备 4 张参考图，将生成 2 个版本…" }]);

    try {
      const formData = new FormData();
      formData.append("prompt", resolvedPrompt);
      formData.append("model", DEFAULT_MODEL);
      formData.append("count", "2");
      await appendReferenceFiles(formData);

      setEvents((current) => [
        ...current,
        { at: Date.now(), message: "参考图准备完成，正在调用 Gemini API…" },
      ]);

      const response = await fetch("/api/generate", {
        method: "POST",
        body: formData,
      });
      const payload = await readApiResponse<{
        images?: Array<{ mimeType: string; data: string }>;
        model?: string;
        error?: string;
      }>(response);
      if (!response.ok) {
        throw new Error(payload.error || "无法提交生成任务");
      }
      const images = payload.images;
      if (!images?.length) {
        throw new Error("Gemini API 未返回任何图片");
      }

      setEvents((current) => [
        ...current,
        { at: Date.now(), message: `Gemini API 返回 ${images.length} 张图片` },
      ]);

      const newResults: ResultItem[] = images.map((img, i) => ({
        id: `gemini-${Date.now()}-${i}`,
        url: img.data,
        prompt: resolvedPrompt,
        createdAt: Date.now(),
      }));
      setResults((current) => {
        const next = [...current, ...newResults];
        setSelectedResult(next.length - 1);
        return next;
      });

      setEvents((current) => [
        ...current,
        { at: Date.now(), message: "生成完成！" },
      ]);
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : "生成失败，请重试";
      setError(message);
      setEvents((current) => [
        ...current,
        { at: Date.now(), message: `生成中止：${message}` },
      ]);
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadResult = (result: ResultItem) => {
    const link = document.createElement("a");
    link.href = result.url;
    link.download = `gemini-${result.id}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const moveResult = (direction: -1 | 1) => {
    if (!results.length) return;
    setSelectedResult(
      (current) => (current + direction + results.length) % results.length,
    );
  };

  return (
    <main className="studio-shell">
      <section className="intro">
        <div>
          <span className="section-number intro-label">KV</span>
          <h1>城市主视觉。</h1>
        </div>
      </section>

      <div className="workspace-grid">
        <section className="editor-column">
          <div className="campaign-section">
            {/* 活动城市 */}
            <div className="config-block">
              <div className="section-heading">
                <div>
                  <span className="section-number">01</span>
                  <div>
                    <h2>活动城市</h2>
                  </div>
                </div>
              </div>
              <div className="campaign-fields campaign-fields-compact">
                <label>
                  <span>城市</span>
                  <input
                    value={city}
                    onChange={(event) => {
                      const nextCity = event.target.value;
                      setActivityTitle((current) =>
                        current === `心动${city}` ? `心动${nextCity}` : current,
                      );
                      setCity(nextCity);
                    }}
                    placeholder="如：杭州"
                  />
                </label>
                <label>
                  <span>标题</span>
                  <input
                    value={activityTitle}
                    onChange={(event) => setActivityTitle(event.target.value)}
                    placeholder="心动XX"
                  />
                </label>
                <label className="campaign-field-full">
                  <span>氛围</span>
                  <input
                    value={atmosphere}
                    onChange={(event) => setAtmosphere(event.target.value)}
                    placeholder="晴天"
                  />
                </label>
              </div>
            </div>

            {/* 构图选择 */}
            <div className="config-block">
              <div className="section-heading">
                <div>
                  <span className="section-number">02</span>
                  <div>
                    <h2>构图选择</h2>
                  </div>
                </div>
              </div>
              <div className="composition-row">
                {compositionRefs.map((comp, compIndex) => (
                  <div
                    className={`composition-card ${comp.enabled ? "" : "disabled"}`}
                    key={compIndex}
                  >
                    <div className="composition-images">
                      {comp.images.map((item, imgIndex) =>
                        item ? (
                          <div className="ref-block" key={item.id}>
                            <button
                              type="button"
                              className="reference-preview"
                              onClick={() => setPreviewReference(item)}
                              aria-label={`查看 ${item.label} 大图`}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={item.src} alt={`${item.label} 参考图`} />
                              <span className="replace-overlay">
                                <b aria-hidden="true">↗</b>
                                查看大图
                              </span>
                              <div className="reference-meta">
                                <span>{item.label}</span>
                                <span
                                  className="replace-icon-btn"
                                  role="button"
                                  tabIndex={0}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    inputRefs.current[item.id]?.click();
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      inputRefs.current[item.id]?.click();
                                    }
                                  }}
                                  aria-label={`替换 ${item.label}`}
                                  title="替换图片"
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="17 8 12 3 7 8" />
                                    <line x1="12" y1="3" x2="12" y2="15" />
                                  </svg>
                                </span>
                              </div>
                            </button>
                            <input
                              ref={(node) => {
                                inputRefs.current[item.id] = node;
                              }}
                              className="visually-hidden"
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              onChange={(event) => replaceReference(item, event)}
                            />
                          </div>
                        ) : (
                          <div className="comp-placeholder" key={imgIndex}>
                            <span>待配置</span>
                          </div>
                        ),
                      )}
                    </div>
                    <label
                      className={`comp-radio ${comp.enabled ? "" : "disabled"}`}
                    >
                      <input
                        type="radio"
                        name="composition"
                        value={compIndex}
                        checked={selectedComposition === compIndex}
                        disabled={!comp.enabled}
                        onChange={() => setSelectedComposition(compIndex)}
                      />
                      <span>构图{compIndex + 1}</span>
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* 画面元素 */}
            <div className="config-block">
              <div className="section-heading">
                <div>
                  <span className="section-number">03</span>
                  <div>
                    <h2>构图{selectedComposition + 1}画面元素</h2>
                  </div>
                </div>
              </div>
              <div className="landmark-module-1">
                <div className="landmark-chips-shell">
                  <div className="landmark-chips">
                    {landmarks.map((name, index) => (
                      <div className="landmark-chip" key={index}>
                        <span>{name}</span>
                        <button
                          type="button"
                          className="landmark-chip-remove"
                          onClick={() =>
                            setLandmarks((current) =>
                              current.filter((_, i) => i !== index),
                            )
                          }
                          aria-label={`删除 ${name}`}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    {landmarks.length < 9 ? (
                      addingLandmark ? (
                        <input
                          ref={newLandmarkRef}
                          className="landmark-chip-input"
                          value={newLandmark}
                          onChange={(e) =>
                            setNewLandmark(e.target.value)
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              const name = newLandmark.trim();
                              if (name) {
                                setLandmarks((c) => [...c, name]);
                              }
                              setNewLandmark("");
                              setAddingLandmark(false);
                            }
                            if (e.key === "Escape") {
                              setNewLandmark("");
                              setAddingLandmark(false);
                            }
                          }}
                          onBlur={() => {
                            const name = newLandmark.trim();
                            if (name) {
                              setLandmarks((c) => [...c, name]);
                            }
                            setNewLandmark("");
                            setAddingLandmark(false);
                          }}
                          placeholder="输入元素名称"
                          aria-label="新元素名称"
                        />
                      ) : (
                        <button
                          type="button"
                          className="landmark-chip-add"
                          onClick={() => {
                            setAddingLandmark(true);
                            setTimeout(() => {
                              newLandmarkRef.current?.focus();
                            }, 0);
                          }}
                          aria-label="添加新元素"
                        >
                          +
                        </button>
                      )
                    ) : null}
                  </div>
                  <small>最多添加九个具有代表性的城市标志元素。</small>
                </div>
                <div className="landmark-action-wrap">
                  <button
                    type="button"
                    className="secondary-action"
                    onClick={suggestLandmarks}
                    disabled={Boolean(landmarkAction)}
                  >
                    {landmarkAction === "suggest"
                      ? "正在寻找元素…"
                      : "帮我想想元素"}
                  </button>
                  <div className={`landmark-cli compact-cli ${cliSuggestCollapsed ? "cli-collapsed" : ""}`}>
                    <div className="landmark-cli-head" onClick={() => setCliSuggestCollapsed((v) => !v)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setCliSuggestCollapsed((v) => !v); } }} aria-expanded={!cliSuggestCollapsed}>
                      <span className="landmark-cli-label">
                          Gemini 指令
                        </span>
                        <span className="cli-toggle" aria-hidden="true">{cliSuggestCollapsed ? "▸" : "▾"}</span>
                    </div>
                    {!cliSuggestCollapsed && (
                      <>
                        <pre className="cli-cmd-block"><code>{`POST /api/landmarks/suggest
  model: gemini-3.6-flash
  city: {{城市}}`}</code></pre>
                        <MarkdownPromptEditor
                          template={suggestPrompt}
                          placeholders={landmarkPlaceholders}
                          onChange={(raw) => setSuggestPrompt(raw)}
                          ariaLabel="元素推荐 CLI 指令"
                        />
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="city-landmark-layout">
                <div className="city-landmark-left">
                  <div className="landmark-image-block">
                    <button
                      type="button"
                      className="reference-preview"
                      onClick={() => setPreviewReference(heartRef)}
                      aria-label={`查看 ${heartRef.label} 大图`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={heartRef.src} alt={`${heartRef.label} 参考图`} />
                      <span className="replace-overlay">
                        <b aria-hidden="true">↗</b>
                        查看大图
                      </span>
                      <div className="reference-meta">
                        <span>{heartRef.label}</span>
                        <span
                          className="replace-icon-btn"
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            inputRefs.current[heartRef.id]?.click();
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              e.stopPropagation();
                              inputRefs.current[heartRef.id]?.click();
                            }
                          }}
                          aria-label={`替换 ${heartRef.label}`}
                          title="替换图片"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="17 8 12 3 7 8" />
                            <line x1="12" y1="3" x2="12" y2="15" />
                          </svg>
                        </span>
                      </div>
                    </button>
                    <input
                      ref={(node) => {
                        inputRefs.current[heartRef.id] = node;
                      }}
                      className="visually-hidden"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(event) => replaceReference(heartRef, event)}
                    />
                  </div>
                  <div className="landmark-action-wrap">
                    <button
                      type="button"
                      className="primary-action"
                      onClick={generateHeartImage}
                      disabled={Boolean(landmarkAction)}
                    >
                      {landmarkAction === "heart"
                        ? "正在生成城市爱心…"
                        : "生成城市爱心"}
                    </button>
                    <div className={`landmark-cli compact-cli ${cliHeartCollapsed ? "cli-collapsed" : ""}`}>
                      <div className="landmark-cli-head" onClick={() => setCliHeartCollapsed((v) => !v)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setCliHeartCollapsed((v) => !v); } }} aria-expanded={!cliHeartCollapsed}>
                        <span className="landmark-cli-label">
                          Gemini 指令
                        </span>
                        <span className="cli-toggle" aria-hidden="true">{cliHeartCollapsed ? "▸" : "▾"}</span>
                      </div>
                      {!cliHeartCollapsed && (
                        <>
                          <pre className="cli-cmd-block"><code>{`POST /api/generate
  model: gemini-3-pro-image
  resolution: 1K
  aspect_ratio: 1:1
  count: 1`}</code></pre>
                          <MarkdownPromptEditor
                            template={heartPrompt}
                            placeholders={landmarkPlaceholders}
                            onChange={(raw) => setHeartPrompt(raw)}
                            ariaLabel="城市爱心生成 CLI 指令"
                          />
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="city-landmark-right">
                  <div className="landmark-image-block">
                    <button
                      type="button"
                      className="reference-preview"
                      onClick={() => setPreviewReference(landmarkRef)}
                      aria-label={`查看 ${landmarkRef.label} 大图`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={landmarkRef.src} alt={`${landmarkRef.label} 参考图`} />
                      <span className="replace-overlay">
                        <b aria-hidden="true">↗</b>
                        查看大图
                      </span>
                      <div className="reference-meta">
                        <span>{landmarkRef.label}</span>
                        <span
                          className="replace-icon-btn"
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            inputRefs.current[landmarkRef.id]?.click();
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              e.stopPropagation();
                              inputRefs.current[landmarkRef.id]?.click();
                            }
                          }}
                          aria-label={`替换 ${landmarkRef.label}`}
                          title="替换图片"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="17 8 12 3 7 8" />
                            <line x1="12" y1="3" x2="12" y2="15" />
                          </svg>
                        </span>
                      </div>
                    </button>
                    <input
                      ref={(node) => {
                        inputRefs.current[landmarkRef.id] = node;
                      }}
                      className="visually-hidden"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(event) => replaceReference(landmarkRef, event)}
                    />
                  </div>
                  <div className="landmark-action-wrap">
                    <button
                      type="button"
                      className="primary-action"
                      onClick={generateLandmarkImage}
                      disabled={Boolean(landmarkAction)}
                    >
                      {landmarkAction === "generate"
                        ? "正在生成城市元素…"
                        : "生成城市元素"}
                    </button>
                    <div className={`landmark-cli compact-cli ${cliGenerateCollapsed ? "cli-collapsed" : ""}`}>
                      <div className="landmark-cli-head" onClick={() => setCliGenerateCollapsed((v) => !v)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setCliGenerateCollapsed((v) => !v); } }} aria-expanded={!cliGenerateCollapsed}>
                        <span className="landmark-cli-label">
                          Gemini 指令
                        </span>
                        <span className="cli-toggle" aria-hidden="true">{cliGenerateCollapsed ? "▸" : "▾"}</span>
                      </div>
                      {!cliGenerateCollapsed && (
                        <>
                          <pre className="cli-cmd-block"><code>{`POST /api/landmarks/generate
  model: gemini-3-pro-image
  resolution: 1K
  aspect_ratio: 1:1`}</code></pre>
                          <MarkdownPromptEditor
                            template={generatePrompt}
                            placeholders={landmarkPlaceholders}
                            onChange={(raw) => setGeneratePrompt(raw)}
                            ariaLabel="标志元素生成 CLI 指令"
                          />
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              {landmarkMessage ? (
                <p className="landmark-message" role="status">
                  {landmarkMessage}
                </p>
              ) : null}
            </div>

            </div>
        </section>

        <aside className="result-column">
          <div className="result-sticky">
            <div className="section-heading result-heading">
              <div>
                <span className="section-number">05</span>
                <div>
                  <h2>生成结果</h2>
                  <p>{results.length ? `${results.length} 个版本` : ""}</p>
                </div>
              </div>
              {activeResult ? (
                <button
                  className="icon-action"
                  type="button"
                  onClick={() => downloadResult(activeResult)}
                  aria-label="下载当前图片"
                >
                  ↓
                </button>
              ) : null}
            </div>

            <div className={`result-stage ${activeResult ? "has-result" : ""}`}>
              {activeResult ? (
                <button
                  type="button"
                  className="result-image-button"
                  onClick={() => setLightboxOpen(true)}
                  aria-label="查看生成结果大图"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={activeResult.url} alt="Gemini 生成结果" />
                  <span>查看大图</span>
                </button>
              ) : (
                <div className="empty-result">
                  <div className="empty-orbit" aria-hidden="true">
                    <span />
                  </div>
                  <strong>{isGenerating ? "正在构建你的视觉" : "准备生成新画面"}</strong>
                  <p>
                    {isGenerating
                      ? "Gemini API 正在生成，请稍候…"
                      : "确认参考图与 Prompt 后，点击开始生成。"}
                  </p>
                </div>
              )}
            </div>

            {results.length > 0 ? (
              <div className="result-history">
                <div className="history-head">
                  <span>版本对比</span>
                  <small>点击缩略图切换</small>
                </div>
                <div className="thumbnail-strip">
                  {results.map((result, index) => (
                    <button
                      type="button"
                      key={`${result.id}-${index}`}
                      className={index === selectedResult ? "active" : ""}
                      onClick={() => setSelectedResult(index)}
                      aria-label={`查看第 ${index + 1} 个生成版本`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={result.url} alt={`生成版本 ${index + 1}`} />
                      <span>V{String(index + 1).padStart(2, "0")}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="progress-panel" aria-live="polite">
              <div className="progress-head">
                <div>
                  <span className={`pulse-dot ${isGenerating ? "active" : ""}`} />
                  <strong>实时进度</strong>
                </div>
                <div className="progress-meta">
                  <span className={`cli-status ${servicePhase}`}>
                    {servicePhase === "online"
                      ? "Gemini API 已连接"
                      : servicePhase === "checking"
                        ? "正在检查 Gemini API"
                        : "Gemini API 未连接"}
                  </span>
                </div>
              </div>
              {events.length ? (
                <ol className="progress-list">
                  {events.slice(-6).map((event, index) => {
                    const isLatest = index === events.slice(-6).length - 1;
                    return (
                      <li
                        className={isLatest && isGenerating ? "current" : "done"}
                        key={`${event.at}-${index}`}
                      >
                        <span aria-hidden="true">{isLatest && isGenerating ? "" : "✓"}</span>
                        <p>{event.message}</p>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="progress-idle">
                  生成开始后，这里会显示参考图准备与 API 调用状态。
                </p>
              )}
            </div>

            {servicePhase === "offline" && serviceError ? (
              <p className="error-message">{serviceError}</p>
            ) : error ? (
              <p className="error-message">{error}</p>
            ) : null}

            <button
              type="button"
              className="generate-button"
              onClick={handleGenerate}
              disabled={isGenerating || servicePhase !== "online"}
            >
              <span>
                {isGenerating
                  ? "生成中"
                  : servicePhase !== "online"
                    ? servicePhase === "checking"
                      ? "正在连接 Gemini API"
                      : "Gemini API 未就绪"
                    : results.length
                      ? "重新生成"
                      : "开始生成"}
              </span>
              {isGenerating ? (
                <span className="button-loader" aria-hidden="true" />
              ) : (
                <span className="button-arrow" aria-hidden="true">
                  ↗
                </span>
              )}
            </button>

            <div className={`landmark-cli prompt-cli ${cliCollapsed ? "cli-collapsed" : ""}`}>
              <div className="landmark-cli-head" onClick={() => setCliCollapsed((v) => !v)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setCliCollapsed((v) => !v); } }} aria-expanded={!cliCollapsed}>
                <span className="landmark-cli-label">
                  Gemini 指令
                </span>
                <span className="cli-toggle" aria-hidden="true">{cliCollapsed ? "▸" : "▾"}</span>
              </div>
              {!cliCollapsed && (
                <>
                  <pre className="cli-cmd-block"><code>{`POST /api/generate
  model: ${DEFAULT_MODEL}
  resolution: 1K
  aspect_ratio: ${FIXED_GENERATION_CONFIG.aspectRatio}
  count: 2`}</code></pre>
                  <MarkdownPromptEditor
                    template={prompt}
                    placeholders={promptPlaceholders}
                    onChange={(raw) => setPrompt(raw)}
                    ariaLabel="生成 Prompt"
                  />
                </>
              )}
            </div>
          </div>
        </aside>
      </div>

      <footer>
        <span>GEMINI STUDIO · API</span>
        <span>
          4 REFERENCES · {MODEL_OPTIONS.find((option) => option.value === DEFAULT_MODEL)?.label?.toUpperCase()} · 2K / 16:9
        </span>
      </footer>

      {previewReference ? (
        <div
          className="lightbox reference-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`${previewReference.label} 参考图大图`}
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setPreviewReference(null);
          }}
        >
          <div className="lightbox-toolbar">
            <span>{previewReference.label}</span>
            <div>
              <button
                type="button"
                className="close-lightbox"
                onClick={() => setPreviewReference(null)}
                aria-label="关闭参考图大图"
              >
                ×
              </button>
            </div>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewReference.src}
            alt={`${previewReference.label} 参考图大图`}
          />
        </div>
      ) : null}

      {lightboxOpen && activeResult ? (
        <div
          className="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="生成结果大图浏览"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setLightboxOpen(false);
          }}
        >
          <div className="lightbox-toolbar">
            <span>
              {selectedResult + 1} / {results.length}
            </span>
            <div>
              <button type="button" onClick={() => downloadResult(activeResult)}>
                下载原图
              </button>
              <button
                type="button"
                className="close-lightbox"
                onClick={() => setLightboxOpen(false)}
                aria-label="关闭大图"
              >
                ×
              </button>
            </div>
          </div>
          {results.length > 1 ? (
            <button
              type="button"
              className="lightbox-nav previous"
              onClick={() => moveResult(-1)}
              aria-label="上一张"
            >
              ←
            </button>
          ) : null}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={activeResult.url} alt="Gemini 生成结果大图" />
          {results.length > 1 ? (
            <button
              type="button"
              className="lightbox-nav next"
              onClick={() => moveResult(1)}
              aria-label="下一张"
            >
              →
            </button>
          ) : null}
          <div className="lightbox-caption">
            <strong>VERSION {String(selectedResult + 1).padStart(2, "0")}</strong>
            <span>GEMINI RESULT</span>
          </div>
        </div>
      ) : null}
    </main>
  );
}