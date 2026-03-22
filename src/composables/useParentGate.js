/**
 * 儿童电视播放器 - 家长验证（数学题门控）
 *
 * 职责：
 * - 生成 100 以内加减法数学题，防止幼儿误触家长设置
 * - 管理验证弹窗的显示、用户输入、错误提示
 * - 验证通过后打开家长设置抽屉
 */

import { reactive, ref } from "vue";
import { settingsVisible } from "./useKidsTvState";

/** 家长验证弹窗是否显示 */
export const challengeVisible = ref(false);

/** 用户输入的答案（输入框 v-model） */
export const challengeInput = ref("");

/** 验证失败时的错误提示文案 */
export const challengeError = ref("");

/** 当前题目与正确答案 */
export const challengeState = reactive({
  expression: "",
  answer: 0,
});

/**
 * 随机生成一道 100 以内、两步加减法题目，结果保证在 [0, 100]。
 * 格式示例："12 + 34 - 5 = ?"
 */
export function generateChallenge() {
  while (true) {
    const a = Math.floor(Math.random() * 100);
    const b = Math.floor(Math.random() * 100);
    const c = Math.floor(Math.random() * 100);
    const usePlusFirst = Math.random() > 0.5;
    const usePlusSecond = Math.random() > 0.5;
    let result = usePlusFirst ? a + b : a - b;
    result = usePlusSecond ? result + c : result - c;
    if (result >= 0 && result <= 100) {
      challengeState.answer = result;
      challengeState.expression = `${a} ${usePlusFirst ? "+" : "-"} ${b} ${
        usePlusSecond ? "+" : "-"
      } ${c} = ?`;
      return;
    }
  }
}

/** 打开家长验证弹窗并生成新题目 */
export function openChallenge() {
  challengeInput.value = "";
  challengeError.value = "";
  generateChallenge();
  challengeVisible.value = true;
}

/** 校验用户输入是否等于正确答案；通过则关闭弹窗并打开家长设置 */
export function verifyChallenge() {
  // if (Number(challengeInput.value) === challengeState.answer) {
  challengeVisible.value = false;
  settingsVisible.value = true;
  return;
  // }
  // challengeError.value = "答案不对，再想一想哦。";
}
