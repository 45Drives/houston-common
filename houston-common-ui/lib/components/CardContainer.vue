<template>
	<div class="card flex flex-col">
		<div v-if="$slots.header" class="card-header flex flex-row space-x-2 items-center">
			<slot name="header"></slot>
		</div>
		<div class="card-body flex-grow">
			<slot></slot>
		</div>
		<div v-if="$slots.footer" class="card-body flex flex-row space-x-2 items-center">
			<slot name="footer"></slot>
		</div>
	</div>
</template>

<style scoped>
@import "@45drives/houston-common-css/src/index.css";
</style>
