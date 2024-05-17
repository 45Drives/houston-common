<script setup lang="ts">

import { ref, watch, defineModel, defineProps, withDefaults } from "vue";
import { type SyntaxParser, type SyntaxParserType, newlineSplitterRegex } from "@45drives/houston-common-lib";
import { reportError } from '@/components/NotificationView.vue';

const props = withDefaults(defineProps<{
    parser: SyntaxParser<any>;
    minRows?: number;
    maxRows?: number;
    disabled?: boolean;
}>(), {
    minRows: 4,
    maxRows: Infinity,
});

const keyValueData = defineModel<SyntaxParserType<typeof props.parser>>({ required: true });

const textAreaContent = ref("");

const onKeyValueDataChanged = (newKeyValueData: SyntaxParserType<typeof props.parser>) =>
    props.parser.unapply(newKeyValueData)
        .map((newContent) => textAreaContent.value = newContent)
        .mapErr(reportError);

const onTextAreaContentChanged = (newContent: string) =>
    props.parser.apply(newContent)
        .map((newData) => keyValueData.value = newData)
        .mapErr(reportError);

watch(keyValueData, onKeyValueDataChanged, { immediate: true, deep: true });

</script>

<template>
    <textarea
        name="global-advanced-settings"
        :rows="Math.min(Math.max(textAreaContent.split(newlineSplitterRegex).length, minRows), maxRows)"
        :disabled="disabled"
        v-model="textAreaContent"
        class="w-full input-textlike"
        placeholder="key = value"
        @change="onTextAreaContentChanged(textAreaContent)"
    ></textarea>
</template>

<style scoped>
@import "@45drives/houston-common-css/src/index.css";
</style>
