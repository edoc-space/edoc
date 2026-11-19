// CommonJS React needs explicit ESM re-exports: export * alone has no stable
// named bindings after production CJS interop/tree shaking.
export { default } from 'react';
export {
  Activity, Children, Component, Fragment, Profiler, PureComponent, StrictMode, Suspense,
  cache, cacheSignal, captureOwnerStack, cloneElement, createContext, createElement, createRef,
  forwardRef, isValidElement, lazy, memo, startTransition, use, useActionState, useCallback,
  useContext, useDebugValue, useDeferredValue, useEffect, useEffectEvent, useId,
  useImperativeHandle, useInsertionEffect, useLayoutEffect, useMemo, useOptimistic,
  useReducer, useRef, useState, useSyncExternalStore, useTransition, version,
} from 'react';
