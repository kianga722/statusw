import React, { Component } from 'react';

class Streams extends Component {
  render() {
    return (
      <div className='streams'>
        {
          this.props.active === null
          && <p>Loading streams...</p>
        }
        {
          this.props.active
          && this.props.active.map((s) => (
            <div key={s}>
              <iframe
                title={`${s}-iframe`}
                src={`https://player.twitch.tv/?channel=${s}&autoplay=false`}
              >
              </iframe>
            </div>
          ))
        }
      </div>
    )
  }
}

export default Streams;