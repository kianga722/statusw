import React, { Component } from 'react';

class Status extends Component {
  render() {
    return (
      <div className='statusBox'>
        {
          this.props.status === null
          && <div className='loading'>Loading stream status...</div>
        }
        {
          this.props.status
          && <div className='statusTable'>
            {
              Object.keys(this.props.status).map((s) => (
                <a key={s}
                   className='statusLine'
                   href={`https://www.twitch.tv/${s}`}
                   target='_blank'
                   rel='noopener noreferrer'>
                  <div className='streamer'>
                    {s}
                  </div>
                  <span className={this.props.status[s] ? 'live' : 'offline'}>
                    {this.props.status[s] ? 'LIVE' : 'Offline'}
                  </span>
                </a>
              ))
            }
          </div>
        }
      </div>
    )
  }
}

export default Status;