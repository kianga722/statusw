import React, { Component } from 'react';
import axios from 'axios';
import Title from './Title/Title'
import Status from './Status/Status'
import Streams from './Streams/Streams'

class App extends Component {
  constructor(props) {
    super(props);

    this.state = {
      status: null,
      active: null
    };
  }

  // initial stream status checkd
  async componentDidMount() {
    const dataTwitch = (await axios.get('/api/')).data;
    this.setState({
      status: dataTwitch.streamersLive,
      active: dataTwitch.active
    });

    // update stream status at regular intervals
    setInterval(async () => {
      const update = (await axios.get('/api/')).data;
      this.setState({
        status: update.streamersLive
      });
    }, 15000)
  }

  render() {
    return (
      <div className="App">
        <Title />
        <Status status={this.state.status} />
        <Streams active={this.state.active} />
      </div>
    );
  }
}

export default App;
