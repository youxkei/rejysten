open List

@bs.module("firebase/app") external firebase: 'a = "default"
%%raw(`import "firebase/firestore"`)

@bs.module("react-firebase-hooks/firestore") external useCollectionData: 'a = "useCollectionData"

let firebaseConfig = {
  "apiKey": "AIzaSyBibda14rl7kYHvJJPyqxXYkL-FnnbpIKk",
  "authDomain": "rejysten.firebaseapp.com",
  "databaseURL": "https://rejysten.firebaseio.com",
  "projectId": "rejysten",
  "storageBucket": "rejysten.appspot.com",
  "messagingSenderId": "720104133648",
  "appId": "1:720104133648:web:5f1f29ef3ae4916cdae695",
  "measurementId": "G-64RW992RRF"
}

firebase["initializeApp"](firebaseConfig)

let items = [
    Item({id: "1", text: "hoge", subitems: [
        Item({id: "2", text: "piyo", subitems: []}),
    ]}),
    Item({id: "3", text: "fuga", subitems: []}),
]

module App = {
    @react.component
    let make = () => {
        let (values, loading, error) = useCollectionData(firebase["firestore"]()["collection"]("items"), { "idField": "id" })

        Js.log(values)

        <List items />
    }
}

switch ReactDOM.querySelector("#app") {
    | Some(app) => ReactDOM.render(<App />, app)
    | None => ()
}
