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
  let cursorId = Recoil.useRecoilValue(Atom.Item.cursorId)
  let setCursor = Recoil.useSetRecoilState(Atom.Item.cursor)

  let Item({id, text}) = item

  let handleMouseDown = event => {
    let button = event->button

    if button == 0 {
      setCursor(._ => Atom.Item.Cursor({id: id, editing: true}))
      event->preventDefault
    }
  }

  let style = if id == cursorId {
    ReactDOM.Style.make(~backgroundColor="red", ())
  } else {
    ReactDOM.Style.make()
  }

  <span style onMouseDown=handleMouseDown> {text->React.string} </span>
}
