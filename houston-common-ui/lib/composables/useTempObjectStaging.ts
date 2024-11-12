import { ref, toRaw, unref, watch, computed, type Ref, type UnwrapRef } from "vue";
import deepEqual from "deep-equal";

export const useTempObjectStaging = <T extends any>(
  originalObject: Ref<T>,
  overrideDefaults?: (_: T) => T
) => {
  const tempObject = ref(structuredClone(toRaw(unref(originalObject))));

  if (overrideDefaults) {
    tempObject.value = overrideDefaults(tempObject.value as T) as UnwrapRef<T>;
  }

  watch(
    originalObject,
    (newObject) => {
      tempObject.value = structuredClone(toRaw(newObject)) as UnwrapRef<T>;
      if (overrideDefaults) {
        tempObject.value = overrideDefaults(tempObject.value as T) as UnwrapRef<T>;
      }
    },
    { deep: true }
  );

  const modified = computed<boolean>(() => !deepEqual(tempObject.value, unref(originalObject)));

  const resetChanges = () => {
    tempObject.value = structuredClone(toRaw(unref(originalObject))) as UnwrapRef<T>;
  };

  return { tempObject, modified, resetChanges };
};
