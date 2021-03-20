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
  let (_, setCursor) = Recoil.useRecoilState(Atom.cursor)
  let Item({id, text}) = item

  let handleMouseDown = event => {
    let button = event->button

    Js.log(button)
    if button == 0 {
      setCursor(Atom.Cursor({id: id, editing: true}))
      event->preventDefault
    }
  }

  <span onMouseDown=handleMouseDown> {text->React.string} </span>
}
