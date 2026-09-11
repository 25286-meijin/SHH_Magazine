export const FIXED_QR_PLACEMENTS = [
  "1F大廳",
  "2F大電視牆",
  "1F關防",
  "B基地美食廣場",
  "空橋直式",
  "雙和故事館",
  "骨科",
  "腎臟+泌尿科",
  "綜合檢查中心",
] as const;

export function isFixedQrPlacement(name: string) {
  return (FIXED_QR_PLACEMENTS as readonly string[]).includes(name);
}
