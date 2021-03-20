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
  let (_, setFocus) = Recoil.useRecoilState(Atom.focus)
  let Item({id, text}) = item

  let handleClick = _ => {
    setFocus(Atom.FocusOnItem(id))
  }

  <span onClick=handleClick> {text->React.string} </span>
}
