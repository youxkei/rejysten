type target = Document(string) | Item(string)

type t =
  | KeyDown({event: Dom.keyboardEvent})
  | Click({event: ReactEvent.Synthetic.t, isDouble: bool, target: target})
