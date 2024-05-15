<script setup lang="ts">

import { ref, watch, defineModel, defineProps } from "vue";
import { type SyntaxParser, type SyntaxParserType } from "@45drives/houston-common-lib";
import { reportError } from '@45drives/houston-common-ui';

const props = defineProps<{
    parser: SyntaxParser<any>
}>();

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

watch(keyValueData, onKeyValueDataChanged, {immediate: true});

</script>

<template>
    <textarea
        name="global-advanced-settings"
        rows="4"
        v-model="textAreaContent"
        class="w-full input-textlike"
        placeholder="key = value"
        @change="onTextAreaContentChanged(textAreaContent)"
    ></textarea>
</template>
