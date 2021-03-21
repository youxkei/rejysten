%%private(
  let preventDefault = ReactEvent.Synthetic.preventDefault
  let button = ReactEvent.Mouse.button
)

type rec item =
  | Item({
      id: string,
      text: string,
      parent: string,
      prev: string,
      next: string,
      firstSubitem: string,
      lastSubitem: string,
    })

@react.component
let make = (~item) => {
  let (cursor, setCursor) = Recoil.useRecoilState(Atom.cursor)
  let Item({id, text}) = item

  let handleMouseDown = event => {
    let button = event->button

    if button == 0 {
      setCursor(_ => Atom.Cursor({id: id, editing: true}))
      event->preventDefault
    }
  }

  let style = switch cursor {
  | Cursor({id: itemId}) if id == itemId =>
    ReactDOM.Style.make(~backgroundColor= "red", ())

  | _ => ReactDOM.Style.make()
  }

  <span style onMouseDown=handleMouseDown> {text->React.string} </span>
}
