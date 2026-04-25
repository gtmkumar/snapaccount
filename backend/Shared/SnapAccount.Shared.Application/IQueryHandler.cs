using MediatR;
using SnapAccount.Shared.Domain;

namespace SnapAccount.Shared.Application;

public interface IQueryHandler<TQuery, TResponse> : IRequestHandler<TQuery, Result<TResponse>>
    where TQuery : IQuery<TResponse>
{
}
