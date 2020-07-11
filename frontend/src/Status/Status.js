import React, { Component } from 'react';

class Status extends Component {
  render() {
    return (
      <div className='statusBox'>
        {
          this.props.status === null
          && <div className='loading'>Loading streamer status...</div>
        }
        {
          this.props.status
          && <div className='statusTable'>
            {
              Object.keys(this.props.status).map((s) => (
                <a key={s}
                  className={this.props.status[s].live ? 'statusLine live' : 'statusLine offline'}
                   href={`https://www.twitch.tv/${s}`}
                   target='_blank'
                   rel='noopener noreferrer'>
                  <span className='streamer'>
                    {s}
                  </span>
                  <span className='status'>
                    {this.props.status[s].live ? 'LIVE' : 'Offline'}
                  </span>
                  {this.props.status[s].live &&
                    <div className='channelInfo'>
                      <div className='infoHeader'>Game</div>
                      <div className='gameName'>
                        {this.props.status[s].game}
                      </div>
                      <div className='infoHeader'>Title</div>
                      <div className='channelTitle'>
                        {this.props.status[s].title}
                      </div>
                    </div>
                  }
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