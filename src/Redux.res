include ReductiveContext.Make({
  type action = Action.t
  type state = State.t
})

module Store = {
  type t = Reductive.Store.t<Action.t, State.t>
}
