type reducer = (State.t, Action.t) => State.t
type dispatch = Action.t => unit

module Store = {
  type t
  type enhancer

  @send external getState: t => State.t = "getState"
  @send external dispatch: t => dispatch = "dispatch"

  @module("redux") external createStore: (reducer, State.t, enhancer) => t = "createStore"
  @module("redux")
  external applyMiddleware: (@curry (t, Action.t => unit, Action.t) => unit) => enhancer =
    "applyMiddleware"

  let addTypeReducer = %raw(`reducer => (state, action) => {
    if (action.type && action.type.startsWith("@@redux/INIT")) {
      state
    } else {
      action.type = "type"
      reducer(state, action)
    }
  }`)

  let create = (reducer, initialState, middleware) => {
    createStore(addTypeReducer(reducer), initialState, applyMiddleware(middleware))
  }
}

let curryMiddleware = %raw(`middleware => store => next => action => middleware(store, next, action)`)

module Provider = {
  type props = {"store": Store.t, "children": React.element}
  @obj external makeProps: (~store: Store.t, ~children: React.element, unit) => props = ""
  @module("react-redux") external make: React.component<props> = "Provider"
}

@module("react-redux") external useSelector: (State.t => 'a) => 'a = "useSelector"
@module("react-redux") external useDispatch: unit => dispatch = "useDispatch"
