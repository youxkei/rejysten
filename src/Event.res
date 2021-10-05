type target = Document(string) | Item(string)
type mouse_or_touch = Mouse(ReactEvent.Mouse.t) | Touch(ReactEvent.Touch.t)

type t =
  | KeyDown({event: Dom.keyboardEvent})
  | Click({event: mouse_or_touch, isDouble: bool, target: target})
  | Blur({event: ReactEvent.Form.t})

let preventDefault = event =>
  switch event {
  | Mouse(event) => event->ReactEvent.Synthetic.preventDefault
  | Touch(event) => event->ReactEvent.Synthetic.preventDefault
  }
