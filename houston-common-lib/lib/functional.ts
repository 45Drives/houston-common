export interface IMonad<T> {
  flatten(): T;
  flatMap<U>(func: (value: T) => IMonad<U>): IMonad<U>;
  map<U>(func: (value: T) => U): IMonad<U>;
}

export const Identity = <T>(value: T): IMonad<T> => ({
  flatten: () => value,

  flatMap: <U>(func: (value: T) => IMonad<U>): IMonad<U> => func(value),

  map: <U>(func: (value: T) => U): IMonad<U> => Identity.of(func(value)),
});

Identity.of = Identity;
