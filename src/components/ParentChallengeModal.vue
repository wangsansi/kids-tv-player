<!--
  家长验证弹窗：展示一道 100 以内加减法数学题，输入正确答案后关闭并打开家长设置抽屉。

  - 题目与答案由 useParentGate 的 challengeState 提供
  - 用户输入 challengeInput，点击「验证」或回车触发 verifyChallenge
  - 错误时显示 challengeError
-->
<script setup>
import {
  challengeError,
  challengeInput,
  challengeState,
  challengeVisible,
  verifyChallenge,
} from "../composables/useParentGate";
</script>

<template>
  <a-modal
    v-model:open="challengeVisible"
    title="家长验证"
    :ok-text="'验证'"
    :cancel-text="'取消'"
    @ok="verifyChallenge"
  >
    <p class="challenge-text">请回答：{{ challengeState.expression }}</p>
    <a-input
      v-model:value="challengeInput"
      inputmode="numeric"
      placeholder="请输入答案"
      @pressEnter="verifyChallenge"
    />
    <p v-if="challengeError" class="error-text">{{ challengeError }}</p>
  </a-modal>
</template>
