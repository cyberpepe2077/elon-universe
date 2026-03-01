import { collectStockCandles } from "./collectors/stock.js";

console.log("TSLA 1분봉 수집 시작...");

const result = await collectStockCandles();

if (result.error) {
  console.error(`오류: ${result.error}`);
  process.exit(1);
}

if (result.saved.length > 0) {
  console.log(`저장 완료: ${result.saved.join(", ")}`);
} else {
  console.log("새로 저장할 데이터 없음");
}

if (result.skipped.length > 0) {
  console.log(`스킵: ${result.skipped.join(", ")}`);
}
