type noteTarget = DocumentPane({documentId: string}) | ItemPane({itemId: string})

type actionLogTarget =
  RecordText(unit) | RecordBegin(unit) | RecordEnd(unit) | Item({itemId: string})

type target =
  | Note(noteTarget)
  | Search(unit)
  | ActionLog({dateActionLogId: string, actionLogId: string, target: actionLogTarget})

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
