import React, { Component } from 'react';
import socketIOClient from 'socket.io-client';
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

  getActiveStreamers = streamersLive => {
    return Object.keys(streamersLive).filter(d => {
      return streamersLive[d].live === true
    })
  }

  // initial stream status checkd
  async componentDidMount() {
    const dataTwitch = (await axios.get('/init')).data;
    const active = this.getActiveStreamers(dataTwitch.streamersLive)
    this.setState({
      status: dataTwitch.streamersLive,
      active
    });

    const socket = socketIOClient('/');

    socket.on('broadcast', async data => {
      if (data === 'update') {
        console.log('Updating Stream Status')
        const update = (await axios.get('/getStreamers')).data;
        this.setState({
          status: update.streamersLive
        });
      }
    })

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
